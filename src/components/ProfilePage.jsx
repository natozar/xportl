import { useState, useRef, useEffect } from 'react';
import { updateDisplayName } from '../services/auth';
import { supabase } from '../services/supabase';
import { xpProgress, getLevelTitle, BADGES } from '../services/gamification';
import { RARITIES } from '../services/capsules';
import { countFriends } from '../services/friendships';

export default function ProfilePage({ session, profile, onOpenSettings, onRefreshProfile, onOpenLeaderboard, onOpenMyCapsules }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [capsuleStats, setCapsuleStats] = useState(null);
  const [friendsCount, setFriendsCount] = useState(null);
  const fileRef = useRef(null);

  // Load capsule stats
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;

    (async () => {
      // Created capsules by rarity
      const { data: created } = await supabase
        .from('capsules')
        .select('rarity')
        .eq('created_by', uid);

      // Discovered (viewed) — count from xp_events
      const { count: discovered } = await supabase
        .from('xp_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .eq('action', 'discover_capsule');

      const byRarity = { common: 0, rare: 0, legendary: 0, mythic: 0 };
      (created || []).forEach((c) => { byRarity[c.rarity || 'common'] = (byRarity[c.rarity || 'common'] || 0) + 1; });

      setCapsuleStats({
        total: (created || []).length,
        byRarity,
        discovered: discovered || 0,
      });

      // Fire-and-forget — if the friendships migration isn't applied
      // yet the count just stays null and the UI hides that stat.
      countFriends().then((n) => setFriendsCount(n)).catch(() => {});
    })();
  }, [session?.user?.id]);

  const user = session?.user;
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const email = user?.email || '';
  const phone = user?.phone || '';
  const provider = user?.app_metadata?.provider || 'email';

  const handleSaveName = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await updateDisplayName(user.id, name.trim());
      setEditingName(false);
      if (onRefreshProfile) onRefreshProfile();
    } catch (_e) { /* save failed */ }
    setSaving(false);
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}.${ext}`;
      await supabase.storage.from('capsule-media').upload(path, file, { upsert: true, contentType: file.type });
      const { data } = supabase.storage.from('capsule-media').getPublicUrl(path);
      await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
      if (onRefreshProfile) onRefreshProfile();
    } catch (err) {
      console.error('[XPortl] Avatar upload failed:', err);
    }
    setAvatarUploading(false);
  };

  return (
    <div style={s.container}>
      <div style={s.scroll}>
        {/* Avatar */}
        <div style={s.avatarSection}>
          <button style={s.avatarBtn} onClick={() => fileRef.current?.click()}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" style={s.avatarImg} />
            ) : (
              <div style={s.avatarPlaceholder}>
                <span style={s.avatarInitial}>{(profile?.display_name || 'X')[0].toUpperCase()}</span>
              </div>
            )}
            <div style={s.avatarOverlay}>
              {avatarUploading ? (
                <div style={s.miniSpinner} />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </div>
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
        </div>

        {/* Name */}
        <div style={s.nameSection}>
          {editingName ? (
            <div style={s.nameEdit}>
              <input
                style={s.nameInput}
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                autoFocus
                maxLength={30}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <button style={s.nameSaveBtn} onClick={handleSaveName} disabled={saving}>
                {saving ? '...' : 'Salvar'}
              </button>
              <button style={s.nameCancelBtn} onClick={() => { setEditingName(false); setName(profile?.display_name || ''); }}>
                Cancelar
              </button>
            </div>
          ) : (
            <button style={s.nameDisplay} onClick={() => setEditingName(true)}>
              <span style={s.nameText}>{profile?.display_name || 'Sem nome'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3 }}>
                <path d="M15 6l3 3-9 9H6v-3l9-9z" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          )}
        </div>

        {/* Info chips */}
        <div style={s.infoRow}>
          {email && <div style={s.chip}>{email}</div>}
          {phone && <div style={s.chip}>{phone}</div>}
          <div style={s.chip}>{provider === 'google' ? 'Google' : provider === 'phone' ? 'Telefone' : 'Email'}</div>
        </div>

        {/* ── XP & Level ── */}
        {(() => {
          const xp = xpProgress(profile?.total_xp || 0);
          const title = getLevelTitle(xp.level);
          const streak = profile?.streak_days || 0;
          const userBadges = (profile?.badges || []).map((id) => BADGES[id]).filter(Boolean);

          return (
            <>
              <div style={s.levelSection}>
                <div style={s.levelHeader}>
                  <span style={s.levelNum}>Lv.{xp.level}</span>
                  <span style={s.levelTitle}>{title}</span>
                  <span style={s.xpTotal}>{(profile?.total_xp || 0).toLocaleString()} XP</span>
                </div>
                <div style={s.xpBarTrack}>
                  <div style={{ ...s.xpBarFill, width: `${xp.progress * 100}%` }} />
                </div>
                <div style={s.xpBarLabel}>
                  <span>{xp.xpToNext} XP para nivel {xp.level + 1}</span>
                  {streak > 0 && <span style={s.streakBadge}>🔥 {streak}d streak</span>}
                </div>
              </div>

              {/* Badges */}
              {userBadges.length > 0 && (
                <div style={s.badgeSection}>
                  <div style={s.badgeLabel}>BADGES ({userBadges.length})</div>
                  <div style={s.badgeGrid}>
                    {userBadges.map((b) => (
                      <div key={b.id} style={s.badgeItem} title={b.desc}>
                        <span style={s.badgeIcon}>{b.icon}</span>
                        <span style={s.badgeName}>{b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Leaderboard button */}
              <button style={s.leaderboardBtn} onClick={onOpenLeaderboard}>
                <span style={{ fontSize: '1rem', marginRight: 8 }}>🏆</span>
                Leaderboard
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', opacity: 0.2 }}>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </>
          );
        })()}

        {/* Capsule stats */}
        {capsuleStats && (
          <div style={s.capsuleStatsSection}>
            <div style={s.badgeLabel}>MEUS PORTAIS</div>
            <div style={s.capsuleStatsRow}>
              <div style={s.capsuleStatMain}>
                <span style={s.capsuleStatNum}>{capsuleStats.total}</span>
                <span style={s.capsuleStatLabel}>criados</span>
              </div>
              <div style={s.capsuleStatMain}>
                <span style={s.capsuleStatNum}>{capsuleStats.discovered}</span>
                <span style={s.capsuleStatLabel}>descobertos</span>
              </div>
              {friendsCount !== null && (
                <div style={s.capsuleStatMain}>
                  <span style={{ ...s.capsuleStatNum, color: '#9FE870' }}>{friendsCount}</span>
                  <span style={s.capsuleStatLabel}>amigos</span>
                </div>
              )}
            </div>
            <div style={s.rarityBreakdown}>
              {Object.entries(capsuleStats.byRarity).map(([key, count]) => {
                const r = RARITIES[key];
                if (!r || count === 0) return null;
                return (
                  <div key={key} style={s.rarityStatItem}>
                    <span style={{ color: r.color, fontSize: '0.7rem' }}>{r.icon}</span>
                    <span style={{ ...s.rarityStatCount, color: r.color }}>{count}</span>
                    <span style={s.rarityStatName}>{r.label}</span>
                  </div>
                );
              })}
            </div>
            {onOpenMyCapsules && capsuleStats.total > 0 && (
              <button style={s.manageBtn} onClick={onOpenMyCapsules}>
                Gerenciar portais e ver interacoes
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', opacity: 0.4 }}>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Stats */}
        <div style={s.statsGrid}>
          <Stat label="Membro desde" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '---'} />
          <Stat label="Status" value={profile?.account_status || 'active'} color={profile?.account_status === 'active' ? '#00f0ff' : '#ff3366'} />
          <Stat label="Nivel" value={`${profile?.level || 1}`} color="#b44aff" />
        </div>

        {/* Settings button */}
        <button style={s.settingsBtn} onClick={onOpenSettings}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 10, opacity: 0.5 }}>
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 1v4m0 14v4m-9.2-6.4l3.5-2m11.5-6.6l3.5-2M1.8 7.6l3.5 2m11.5 6.6l3.5 2M1 12h4m14 0h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Configuracoes e Conta
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', opacity: 0.2 }}>
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={s.statCard}>
      <span style={s.statLabel}>{label}</span>
      <span style={{ ...s.statValue, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

const s = {
  container: {
    position: 'fixed', inset: 0,
    background: 'var(--bg-void)',
    zIndex: 50, pointerEvents: 'auto',
    paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
  },
  scroll: {
    height: '100%', overflowY: 'auto', padding: '24px 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  // ── Avatar ──
  avatarSection: { marginBottom: 16, marginTop: 20 },
  avatarBtn: {
    width: 88, height: 88, borderRadius: '50%', position: 'relative',
    overflow: 'hidden', background: 'none', border: '2px solid rgba(0,240,255,0.2)',
    padding: 0, boxShadow: '0 0 20px rgba(0,240,255,0.1)',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' },
  avatarPlaceholder: {
    width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,240,255,0.06)',
  },
  avatarInitial: { fontSize: '2rem', fontWeight: 700, color: '#00f0ff' },
  avatarOverlay: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.4)', color: '#fff', opacity: 0.5, transition: 'opacity 0.2s',
  },
  miniSpinner: {
    width: 16, height: 16, border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
  },
  // ── Name ──
  nameSection: { marginBottom: 12, width: '100%', maxWidth: 320 },
  nameDisplay: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'none', border: 'none', color: 'var(--text-primary)', padding: '8px 0',
    fontFamily: 'inherit',
  },
  nameText: { fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.05em' },
  nameEdit: { display: 'flex', gap: 8, alignItems: 'center' },
  nameInput: {
    flex: 1, padding: '10px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,240,255,0.15)',
    color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none',
  },
  nameSaveBtn: {
    padding: '10px 14px', borderRadius: 10, background: 'rgba(0,240,255,0.1)',
    border: '1px solid rgba(0,240,255,0.2)', color: '#00f0ff',
    fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
  },
  nameCancelBtn: {
    padding: '10px 12px', borderRadius: 10, background: 'none',
    border: 'none', color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'inherit',
  },
  // ── Info ──
  infoRow: {
    display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 20,
  },
  chip: {
    fontSize: '0.58rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)',
    padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)',
  },
  // ── XP & Level ──
  levelSection: {
    width: '100%', maxWidth: 360, marginBottom: 16,
    padding: '16px 18px', borderRadius: 16,
    background: 'rgba(180,74,255,0.04)', border: '1px solid rgba(180,74,255,0.1)',
  },
  levelHeader: {
    display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8,
  },
  levelNum: {
    fontSize: '1.2rem', fontWeight: 700, color: '#b44aff',
    textShadow: '0 0 10px rgba(180,74,255,0.3)',
  },
  levelTitle: {
    fontSize: '0.68rem', fontWeight: 600, color: 'rgba(180,74,255,0.6)',
    letterSpacing: '0.06em',
  },
  xpTotal: {
    fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginLeft: 'auto',
  },
  xpBarTrack: {
    height: 4, borderRadius: 2, background: 'rgba(180,74,255,0.1)', overflow: 'hidden',
  },
  xpBarFill: {
    height: '100%', borderRadius: 2, background: '#b44aff',
    boxShadow: '0 0 8px rgba(180,74,255,0.4)', transition: 'width 0.5s ease',
  },
  xpBarLabel: {
    display: 'flex', justifyContent: 'space-between', marginTop: 6,
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)',
  },
  streakBadge: {
    color: '#ffaa00', fontWeight: 600,
  },

  // ── Badges ──
  badgeSection: {
    width: '100%', maxWidth: 360, marginBottom: 16,
  },
  badgeLabel: {
    fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.2)', marginBottom: 8,
  },
  badgeGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  badgeItem: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
  },
  badgeIcon: { fontSize: '0.9rem' },
  badgeName: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 },

  // ── Leaderboard button ──
  leaderboardBtn: {
    width: '100%', maxWidth: 360, display: 'flex', alignItems: 'center',
    padding: '14px 16px', borderRadius: 14, marginBottom: 16,
    background: 'rgba(0,240,255,0.03)', border: '1px solid rgba(0,240,255,0.08)',
    color: '#00f0ff', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
  },

  // ── Capsule Stats ──
  capsuleStatsSection: {
    width: '100%', maxWidth: 360, marginBottom: 16,
    padding: '14px 18px', borderRadius: 16,
    background: 'rgba(0,240,255,0.03)', border: '1px solid rgba(0,240,255,0.08)',
  },
  capsuleStatsRow: {
    display: 'flex', gap: 16, marginBottom: 12,
  },
  capsuleStatMain: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '10px 0', borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
  },
  capsuleStatNum: { fontSize: '1.4rem', fontWeight: 700, color: '#00f0ff' },
  capsuleStatLabel: { fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.08em' },
  rarityBreakdown: {
    display: 'flex', gap: 8, justifyContent: 'center',
  },
  rarityStatItem: {
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.02)',
  },
  rarityStatCount: { fontSize: '0.75rem', fontWeight: 700 },
  rarityStatName: { fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)', fontWeight: 600 },
  manageBtn: {
    marginTop: 12, width: '100%', display: 'flex', alignItems: 'center',
    padding: '10px 12px', borderRadius: 10,
    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.12)',
    color: '#00f0ff', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit',
    letterSpacing: '0.04em',
  },

  // ── Stats ──
  statsGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
    width: '100%', maxWidth: 360, marginBottom: 24,
  },
  statCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '14px 8px', borderRadius: 12,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.03)',
  },
  statLabel: { fontSize: '0.48rem', color: 'var(--text-muted)', letterSpacing: '0.08em', fontWeight: 600 },
  statValue: { fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 600 },
  // ── Settings ──
  settingsBtn: {
    width: '100%', maxWidth: 360, display: 'flex', alignItems: 'center',
    padding: '14px 16px', borderRadius: 14,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
    color: 'var(--text-primary)', fontSize: '0.78rem', fontWeight: 500, fontFamily: 'inherit',
  },
};
