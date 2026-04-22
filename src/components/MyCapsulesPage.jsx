import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { selfDestruct, getRarity, getCapsuleType, isCapsuleLocked, getTimeRemaining } from '../services/capsules';
import { trackEvent } from '../services/events';
import { getFriendshipStates, sendFriendRequest, acceptFriendRequest } from '../services/friendships';

/**
 * MyCapsulesPage — full-screen list of the user's own capsules.
 *
 * Goals:
 *  - Self-service: user can review and delete any capsule they've launched.
 *  - Engagement tracking: aggregates views, comments and echoes per portal.
 *  - Social surface: shows who interacted (commenters + echoers) as the first
 *    step toward a friendships feature. We render display_name + avatar so the
 *    owner can recognize returning engagers without exposing raw user IDs.
 */
export default function MyCapsulesPage({ session, onBack, onRefreshProfile }) {
  const [items, setItems] = useState(null); // null = loading, [] = empty, [...] = rows
  const [expandedId, setExpandedId] = useState(null);
  const [interactors, setInteractors] = useState({}); // capsuleId -> array
  const [loadingInteractors, setLoadingInteractors] = useState({});
  const [deleting, setDeleting] = useState({});
  const [confirmId, setConfirmId] = useState(null);
  // userId -> 'none' | 'pending_sent' | 'pending_received' | 'friends'
  const [friendStates, setFriendStates] = useState({});
  const [friendActionId, setFriendActionId] = useState(null);

  const uid = session?.user?.id;

  const load = useCallback(async () => {
    if (!uid) return;
    setItems(null);

    // Capsules created by me, newest first.
    const { data: caps, error } = await supabase
      .from('capsules')
      .select('id, lat, lng, content, unlock_date, views_count, views_left, media_url, media_type, rarity, capsule_type, visibility_layer, moderation_status, created_at')
      .eq('created_by', uid)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('[XPortl MyCapsules] list failed:', error.message);
      setItems([]);
      return;
    }

    // Aggregate counts in parallel (cheap: HEAD counts, no row fetch)
    const rows = caps || [];
    const enriched = await Promise.all(
      rows.map(async (c) => {
        const [cm, ec] = await Promise.all([
          supabase.from('comments').select('id', { count: 'exact', head: true }).eq('capsule_id', c.id),
          supabase.from('capsule_interactions').select('id', { count: 'exact', head: true })
            .eq('capsule_id', c.id).eq('interaction_type', 'echo_replant'),
        ]);
        return {
          ...c,
          comments_count: cm.count || 0,
          echo_count: ec.count || 0,
        };
      })
    );

    setItems(enriched);
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  const loadInteractors = useCallback(async (capsuleId) => {
    if (interactors[capsuleId] || loadingInteractors[capsuleId]) return;
    setLoadingInteractors((s) => ({ ...s, [capsuleId]: true }));

    // Pull commenters and echoers in parallel.
    const [commentsRes, interactionsRes] = await Promise.all([
      supabase
        .from('comments')
        .select('user_id, created_at, user_profiles(display_name, avatar_url)')
        .eq('capsule_id', capsuleId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('capsule_interactions')
        .select('user_id, interaction_type, created_at, user_profiles(display_name, avatar_url)')
        .eq('capsule_id', capsuleId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    // Merge by user_id, keeping the latest interaction timestamp + a set of
    // interaction kinds so the owner sees "comentou · ecoou" in one row.
    const byUser = new Map();
    const pushKind = (u, kind, at, profile) => {
      if (!u || u === uid) return; // skip self
      const existing = byUser.get(u) || { userId: u, kinds: new Set(), latestAt: null, displayName: null, avatarUrl: null };
      existing.kinds.add(kind);
      if (!existing.latestAt || new Date(at) > new Date(existing.latestAt)) existing.latestAt = at;
      if (!existing.displayName && profile?.display_name) existing.displayName = profile.display_name;
      if (!existing.avatarUrl && profile?.avatar_url) existing.avatarUrl = profile.avatar_url;
      byUser.set(u, existing);
    };

    (commentsRes.data || []).forEach((r) => pushKind(r.user_id, 'comment', r.created_at, r.user_profiles));
    (interactionsRes.data || []).forEach((r) => pushKind(r.user_id, r.interaction_type, r.created_at, r.user_profiles));

    const list = [...byUser.values()]
      .map((i) => ({ ...i, kinds: [...i.kinds] }))
      .sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));

    setInteractors((s) => ({ ...s, [capsuleId]: list }));
    setLoadingInteractors((s) => ({ ...s, [capsuleId]: false }));

    // Hydrate friendship states for the interactors we haven't seen yet.
    const needed = list.map((i) => i.userId).filter((id) => !(id in friendStates));
    if (needed.length > 0) {
      getFriendshipStates(needed).then((m) => {
        setFriendStates((prev) => {
          const next = { ...prev };
          for (const [id, st] of m.entries()) next[id] = st;
          return next;
        });
      }).catch(() => {});
    }
  }, [interactors, loadingInteractors, uid, friendStates]);

  const handleToggle = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    loadInteractors(id);
  };

  const handleFriendAction = async (otherUserId) => {
    if (friendActionId) return;
    setFriendActionId(otherUserId);
    const state = friendStates[otherUserId] || 'none';
    try {
      if (state === 'none') {
        const r = await sendFriendRequest(otherUserId);
        if (r.ok) {
          setFriendStates((s) => ({ ...s, [otherUserId]: r.reason === 'accepted' ? 'friends' : 'pending_sent' }));
          trackEvent('friend_request_sent', { to: otherUserId });
        }
      } else if (state === 'pending_received') {
        const r = await acceptFriendRequest(otherUserId);
        if (r.ok) {
          setFriendStates((s) => ({ ...s, [otherUserId]: 'friends' }));
          trackEvent('friend_request_accepted', { from: otherUserId });
        }
      }
      // pending_sent and friends are terminal from this screen — no action.
    } catch (err) {
      console.error('[XPortl MyCapsules] friend action failed:', err);
    }
    setFriendActionId(null);
  };

  const handleShare = async (id) => {
    const url = `${window.location.origin}/p/${id}`;
    trackEvent('portal_shared', { capsule_id: id });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Meu portal no XPortl', url });
        return;
      }
    } catch { /* user cancelled or API unavailable — fall through to clipboard */ }
    try {
      await navigator.clipboard.writeText(url);
    } catch { /* clipboard blocked — do nothing, user can copy manually from the URL we'll show */ }
  };

  const handleDelete = async (id) => {
    if (deleting[id]) return;
    setDeleting((s) => ({ ...s, [id]: true }));
    try {
      await selfDestruct(id);
      trackEvent('capsule_deleted', { capsule_id: id });
      setItems((prev) => (prev || []).filter((c) => c.id !== id));
      if (onRefreshProfile) onRefreshProfile();
    } catch (err) {
      console.error('[XPortl MyCapsules] delete failed:', err);
    }
    setDeleting((s) => ({ ...s, [id]: false }));
    setConfirmId(null);
  };

  return (
    <div style={s.container}>
      {/* ── Header ── */}
      <header style={s.header}>
        <button style={s.backBtn} onClick={onBack} aria-label="Voltar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 style={s.title}>Meus Portais</h1>
        <span style={s.counter}>{items?.length ?? '...'}</span>
      </header>

      <div style={s.scroll}>
        {items === null && (
          <div style={s.empty}>
            <div style={s.spinner} />
            <span>Carregando portais...</span>
          </div>
        )}

        {items?.length === 0 && (
          <div style={s.empty}>
            <span style={{ fontSize: '2rem', marginBottom: 10 }}>🌀</span>
            <span>Voce ainda nao lancou nenhum portal.</span>
            <span style={s.emptyHint}>Explore o mapa e deixe um rastro onde passar.</span>
          </div>
        )}

        {items?.map((c) => {
          const rarity = getRarity(c);
          const cType = getCapsuleType(c);
          const locked = isCapsuleLocked(c);
          const timeLeft = locked ? getTimeRemaining(c) : null;
          const expanded = expandedId === c.id;
          const body = c.content?.body || c.content?.emoji || '(sem conteudo)';
          const list = interactors[c.id];
          const loadingList = loadingInteractors[c.id];
          const isDeleting = !!deleting[c.id];
          const isConfirming = confirmId === c.id;

          return (
            <div key={c.id} style={{ ...s.card, borderColor: rarity.color + '33' }}>
              <button style={s.cardMain} onClick={() => handleToggle(c.id)}>
                <div style={s.cardTop}>
                  <div style={s.badgesRow}>
                    <span style={{ ...s.rarityBadge, color: rarity.color, borderColor: rarity.color + '44' }}>
                      <span aria-hidden>{rarity.icon}</span> {rarity.label}
                    </span>
                    <span style={s.typeBadge}>{cType.icon} {cType.label}</span>
                    {locked && <span style={s.lockedBadge}>🔒 {timeLeft}</span>}
                    {c.moderation_status && c.moderation_status !== 'active' && (
                      <span style={s.moderationBadge}>{c.moderation_status}</span>
                    )}
                  </div>
                  <span style={s.cardDate}>{formatDate(c.created_at)}</span>
                </div>
                <p style={s.cardBody}>{body}</p>
                <div style={s.cardStats}>
                  <Stat icon="👁" n={c.views_count || 0} label="vistas" />
                  <Stat icon="💬" n={c.comments_count} label="coment." />
                  <Stat icon="📡" n={c.echo_count} label="ecos" />
                  <span style={s.coord}>{c.lat?.toFixed(4)}, {c.lng?.toFixed(4)}</span>
                </div>
              </button>

              {expanded && (
                <div style={s.expanded}>
                  <div style={s.sectionLabel}>QUEM INTERAGIU</div>
                  {loadingList && <div style={s.muted}>Carregando...</div>}
                  {!loadingList && list?.length === 0 && (
                    <div style={s.muted}>Ninguem interagiu ainda. Compartilhe o link pra atrair portal walkers.</div>
                  )}
                  {!loadingList && list?.map((i) => {
                    const st = friendStates[i.userId] || 'none';
                    const busy = friendActionId === i.userId;
                    return (
                      <div key={i.userId} style={s.interactor}>
                        {i.avatarUrl ? (
                          <img src={i.avatarUrl} alt="" style={s.avatar} />
                        ) : (
                          <div style={s.avatarFallback}>{(i.displayName || '?')[0].toUpperCase()}</div>
                        )}
                        <div style={s.interactorMeta}>
                          <span style={s.interactorName}>{i.displayName || 'Portal Walker'}</span>
                          <span style={s.interactorKinds}>{humanizeKinds(i.kinds)} · {formatDate(i.latestAt)}</span>
                        </div>
                        <FriendBtn state={st} busy={busy} onClick={() => handleFriendAction(i.userId)} />
                      </div>
                    );
                  })}

                  <div style={s.actionsRow}>
                    {!isConfirming && (
                      <button style={s.shareBtn} onClick={() => handleShare(c.id)}>
                        Compartilhar link
                      </button>
                    )}
                    {!isConfirming && (
                      <button style={s.deleteBtn} onClick={() => setConfirmId(c.id)} disabled={isDeleting}>
                        Apagar portal
                      </button>
                    )}
                    {isConfirming && (
                      <div style={s.confirmRow}>
                        <span style={s.confirmText}>Apagar de vez?</span>
                        <button style={s.confirmBtn} onClick={() => handleDelete(c.id)} disabled={isDeleting}>
                          {isDeleting ? '...' : 'Sim, apagar'}
                        </button>
                        <button style={s.cancelBtn} onClick={() => setConfirmId(null)} disabled={isDeleting}>
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FriendBtn({ state, busy, onClick }) {
  const map = {
    none:             { label: 'Adicionar',     style: s.friendBtnPrimary,  active: true  },
    pending_sent:     { label: 'Pendente',      style: s.friendBtnMuted,    active: false },
    pending_received: { label: 'Aceitar',       style: s.friendBtnAccent,   active: true  },
    friends:          { label: 'Amigos',        style: s.friendBtnSuccess,  active: false },
  };
  const m = map[state] || map.none;
  return (
    <button
      style={{ ...s.friendBtnBase, ...m.style, ...(busy ? s.friendBtnBusy : {}) }}
      onClick={m.active ? onClick : undefined}
      disabled={!m.active || busy}
      aria-label={m.label}
    >
      {busy ? '...' : m.label}
    </button>
  );
}

function Stat({ icon, n, label }) {
  return (
    <span style={s.stat}>
      <span aria-hidden>{icon}</span>
      <strong>{n}</strong>
      <span style={s.statLabel}>{label}</span>
    </span>
  );
}

function humanizeKinds(kinds) {
  const map = {
    comment: 'comentou',
    echo_replant: 'replantou',
    challenge_complete: 'completou desafio',
    collab_add: 'colaborou',
    auction_bid: 'deu lance',
  };
  return kinds.map((k) => map[k] || k).join(' · ');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const s = {
  container: {
    position: 'fixed', inset: 0, background: 'var(--bg-void)', zIndex: 55,
    display: 'flex', flexDirection: 'column',
    paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
    background: 'rgba(10,8,20,0.85)', backdropFilter: 'blur(12px)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)',
    color: 'var(--text-primary)', fontFamily: 'inherit',
  },
  title: {
    flex: 1, margin: 0, fontSize: '0.9rem', fontWeight: 700,
    letterSpacing: '0.08em', color: 'var(--text-primary)',
  },
  counter: {
    fontSize: '0.65rem', color: '#00f0ff', fontWeight: 600,
    padding: '4px 10px', borderRadius: 12,
    background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.15)',
  },
  scroll: {
    flex: 1, overflowY: 'auto', padding: '14px 14px 20px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    padding: '40px 20px', color: 'var(--text-muted)', fontSize: '0.78rem',
  },
  emptyHint: { fontSize: '0.68rem', opacity: 0.6 },
  spinner: {
    width: 20, height: 20, border: '2px solid rgba(255,255,255,0.1)',
    borderTopColor: '#00f0ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
    marginBottom: 6,
  },
  card: {
    borderRadius: 14, background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
  },
  cardMain: {
    width: '100%', textAlign: 'left', padding: '14px 16px',
    background: 'none', border: 'none', color: 'var(--text-primary)',
    fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 10,
  },
  cardTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  badgesRow: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  rarityBadge: {
    fontSize: '0.58rem', fontWeight: 700, padding: '3px 8px',
    borderRadius: 8, border: '1px solid', letterSpacing: '0.06em',
  },
  typeBadge: {
    fontSize: '0.58rem', color: 'rgba(255,255,255,0.55)',
    padding: '3px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.03)',
  },
  lockedBadge: {
    fontSize: '0.58rem', color: '#b44aff', padding: '3px 8px',
    borderRadius: 8, background: 'rgba(180,74,255,0.08)',
    border: '1px solid rgba(180,74,255,0.2)',
  },
  moderationBadge: {
    fontSize: '0.55rem', color: '#ff6688', padding: '3px 8px',
    borderRadius: 8, background: 'rgba(255,102,136,0.08)',
    border: '1px solid rgba(255,102,136,0.2)', textTransform: 'uppercase',
  },
  cardDate: { fontSize: '0.58rem', color: 'rgba(255,255,255,0.3)' },
  cardBody: {
    margin: 0, fontSize: '0.8rem', lineHeight: 1.4,
    color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardStats: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.03)',
  },
  stat: {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)',
  },
  statLabel: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' },
  coord: {
    marginLeft: 'auto', fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)',
    fontFamily: 'ui-monospace, Menlo, monospace',
  },
  expanded: {
    padding: '12px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.04)',
    background: 'rgba(0,0,0,0.15)',
  },
  sectionLabel: {
    fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.3)', marginBottom: 8,
  },
  muted: { fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', padding: '4px 0 10px' },
  interactor: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
  },
  avatar: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' },
  avatarFallback: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(0,240,255,0.08)', color: '#00f0ff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.7rem', fontWeight: 700,
  },
  interactorMeta: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  interactorName: {
    fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  interactorKinds: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)' },
  friendBtnBase: {
    marginLeft: 'auto', padding: '5px 10px', borderRadius: 999,
    fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', fontFamily: 'inherit', whiteSpace: 'nowrap',
    border: '1px solid', cursor: 'pointer',
  },
  friendBtnPrimary: { color: '#00f0ff', borderColor: 'rgba(0,240,255,0.3)', background: 'rgba(0,240,255,0.08)' },
  friendBtnAccent:  { color: '#0a0a14', borderColor: '#00e5ff',               background: '#00e5ff' },
  friendBtnMuted:   { color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' },
  friendBtnSuccess: { color: '#9FE870', borderColor: 'rgba(159,232,112,0.25)', background: 'rgba(159,232,112,0.06)' },
  friendBtnBusy:    { opacity: 0.6, cursor: 'wait' },
  actionsRow: { marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  shareBtn: {
    padding: '8px 14px', borderRadius: 10,
    background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.25)',
    color: '#00f0ff', fontSize: '0.68rem', fontWeight: 600,
    fontFamily: 'inherit', letterSpacing: '0.06em',
  },
  deleteBtn: {
    padding: '8px 14px', borderRadius: 10,
    background: 'rgba(255,68,102,0.08)', border: '1px solid rgba(255,68,102,0.25)',
    color: '#ff4466', fontSize: '0.68rem', fontWeight: 600,
    fontFamily: 'inherit', letterSpacing: '0.06em',
  },
  confirmRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  confirmText: { fontSize: '0.68rem', color: '#ff8888' },
  confirmBtn: {
    padding: '8px 12px', borderRadius: 10,
    background: '#ff4466', color: '#0a0a14',
    border: 0, fontSize: '0.65rem', fontWeight: 700,
    fontFamily: 'inherit', letterSpacing: '0.06em',
  },
  cancelBtn: {
    padding: '8px 12px', borderRadius: 10,
    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem',
    fontFamily: 'inherit',
  },
};
