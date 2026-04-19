import { useEffect, useState, useRef, useCallback } from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining, haptic, consumeView, selfDestruct, getRarity, getCapsuleType } from '../services/capsules';
import { getComments, addComment } from '../services/comments';
import { echoReplant, checkChainEligibility, completeChallenge, addCollabEntry, getCollabEntries, auctionBid, getAuctionCost, getEchoCount, hasInteracted } from '../services/interactions';
import { supabase } from '../services/supabase';

export default function CapsuleModal({ capsule, onClose, onSelfDestruct, onReport, userLat, userLng, onDeleteOwn }) {
  const [viewsLeft, setViewsLeft] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState(null);

  // Type-specific state
  const [typeAction, setTypeAction] = useState(null); // loading | done | error | blocked
  const [typeInfo, setTypeInfo] = useState(null);
  const [collabEntries, setCollabEntries] = useState([]);
  const [collabText, setCollabText] = useState('');

  const audioRef = useRef(null);
  const consumedRef = useRef(false);
  const commentsEndRef = useRef(null);
  const inputRef = useRef(null);

  const locked = capsule ? isCapsuleLocked(capsule) : false;
  const ghost = capsule ? isGhostCapsule(capsule) : false;
  const timeLeft = capsule ? getTimeRemaining(capsule) : null;
  const content = capsule?.content || {};
  const body = content.body || content.emoji || '';
  const rarity = capsule ? getRarity(capsule) : null;
  const cType = capsule ? getCapsuleType(capsule) : null;
  const useRarityColor = rarity && rarity.key !== 'common';
  const accent = locked ? '#b44aff' : useRarityColor ? rarity.color : '#00f0ff';
  const capsuleType = capsule?.capsule_type || 'standard';

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  useEffect(() => {
    setViewsLeft(null);
    setAudioPlaying(false);
    setComments([]);
    setCommentText('');
    setTypeAction(null);
    setTypeInfo(null);
    setCollabEntries([]);
    setCollabText('');
    consumedRef.current = false;
  }, [capsule?.id]);

  // Consume view — only when close enough
  useEffect(() => {
    if (!capsule || locked || consumedRef.current) return;
    if (capsuleType === 'auction') return;
    // Don't consume if too far
    const d = capsule.distance_meters;
    if (d !== undefined && d > 10) return;
    consumedRef.current = true;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (!isFake) {
      consumeView(capsule.id).then((r) => setViewsLeft(r?.views_left ?? null)).catch(() => {});
    }
    haptic([60, 30, 60]);
  }, [capsule, locked, capsuleType]);

  // Load comments — only when close enough
  useEffect(() => {
    if (!capsule || locked) return;
    const d = capsule.distance_meters;
    if (d !== undefined && d > 10) return;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (isFake) return;
    getComments(capsule.id).then(setComments).catch(() => {});
  }, [capsule, locked]);

  // Load type-specific data
  useEffect(() => {
    if (!capsule || !userId || locked) return;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (isFake) return;

    if (capsuleType === 'chain') {
      setTypeAction('loading');
      checkChainEligibility(userId, userLat, userLng).then((eligible) => {
        setTypeAction(eligible ? null : 'blocked');
        setTypeInfo(eligible ? null : 'Voce precisa deixar um portal aqui antes de abrir esta Corrente.');
      }).catch(() => setTypeAction(null));
    }

    if (capsuleType === 'collab') {
      getCollabEntries(capsule.id).then(setCollabEntries).catch(() => {});
    }

    if (capsuleType === 'auction') {
      setTypeAction('loading');
      Promise.all([
        getAuctionCost(capsule.id),
        hasInteracted(capsule.id, userId, 'auction_bid'),
      ]).then(([cost, alreadyBid]) => {
        if (alreadyBid) {
          setTypeAction(null);
          consumedRef.current = true;
        } else {
          setTypeAction('auction_gate');
          setTypeInfo({ cost });
        }
      }).catch(() => setTypeAction(null));
    }

    if (capsuleType === 'echo') {
      getEchoCount(capsule.id).then((count) => {
        setTypeInfo({ echoCount: count });
      }).catch(() => {});
    }
  }, [capsule, userId, locked, capsuleType, userLat, userLng]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSend = useCallback(async () => {
    if (!commentText.trim() || !capsule || !userId || sending) return;
    setSending(true);
    try {
      const result = await addComment(capsule.id, userId, commentText);
      if (result) {
        setComments((prev) => [...prev, { id: result.id, body: result.body, createdAt: result.created_at, userId: result.user_id, displayName: 'Voce', avatarUrl: null }]);
        setCommentText('');
      }
    } catch { /* silent */ } finally { setSending(false); }
  }, [commentText, capsule, userId, sending]);

  // ── Type-specific actions ──
  const handleEchoReplant = async () => {
    if (!userId || !userLat) return;
    setTypeAction('loading');
    try {
      await echoReplant(capsule, userId, userLat, userLng);
      setTypeAction('done');
      setTypeInfo({ echoCount: (typeInfo?.echoCount || 0) + 1 });
      haptic([80, 40, 80]);
    } catch { setTypeAction('error'); }
  };

  const handleChallenge = async () => {
    if (!userId) return;
    setTypeAction('loading');
    try {
      await completeChallenge(capsule.id, userId);
      setTypeAction('done');
      haptic([100, 50, 100, 50, 100]);
    } catch { setTypeAction('error'); }
  };

  const handleCollabAdd = async () => {
    if (!collabText.trim() || !userId) return;
    setSending(true);
    try {
      const result = await addCollabEntry(capsule.id, userId, collabText);
      if (result) {
        setCollabEntries((prev) => [...prev, { id: result.id, body: result.content?.body, userId, displayName: 'Voce', createdAt: result.created_at }]);
        setCollabText('');
      }
    } catch { /* silent */ } finally { setSending(false); }
  };

  const handleAuctionBid = async () => {
    if (!userId) return;
    setTypeAction('loading');
    try {
      const result = await auctionBid(capsule.id, userId);
      if (result.success) {
        setTypeAction(null);
        consumedRef.current = true;
        consumeView(capsule.id).catch(() => {});
        haptic([60, 30, 60]);
      } else {
        setTypeAction('auction_gate');
        setTypeInfo({ cost: result.cost, insufficient: true, userXp: result.userXp });
      }
    } catch { setTypeAction('error'); }
  };

  if (!capsule) return null;

  const close = () => {
    if (viewsLeft !== null && viewsLeft <= 0) {
      setTimeout(() => { selfDestruct(capsule.id).catch(() => {}); onSelfDestruct?.(capsule.id); }, 300);
    }
    onClose();
  };

  const hasMedia = capsule.media_url && (capsule.media_type === 'image' || capsule.media_type === 'video');

  // ── Distance gate: must be within 10m to see content ──
  // GPS has ~5-10m accuracy, so 10m gives margin while preventing
  // opening capsules from another location entirely.
  const OPEN_RADIUS = 10; // meters
  const dist = capsule.distance_meters;
  const tooFar = dist !== undefined && dist > OPEN_RADIUS;

  // Chain blocked — can't see content
  const chainBlocked = capsuleType === 'chain' && typeAction === 'blocked';
  // Auction gated — must pay XP first
  const auctionGated = capsuleType === 'auction' && typeAction === 'auction_gate';
  const contentHidden = tooFar || chainBlocked || auctionGated;

  return (
    <div style={st.overlay}>
      {/* Top bar */}
      <div style={st.topBar}>
        <button style={st.backBtn} onClick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={st.topInfo}>
          {capsule.created_at && <span style={st.topDate}>{new Date(capsule.created_at).toLocaleDateString('pt-BR')}</span>}
          <span style={{ ...st.topChip, borderColor: `${accent}33`, color: accent }}>{capsule.visibility_layer || 'public'}</span>
          {rarity && rarity.key !== 'common' && (
            <span style={{ ...st.topChip, borderColor: `${rarity.color}33`, color: rarity.color, fontWeight: 700 }}>{rarity.icon} {rarity.label}</span>
          )}
          {cType && cType.key !== 'standard' && <span style={st.topChip}>{cType.icon} {cType.label}</span>}
          {capsule.distance_meters !== undefined && (
            <span style={st.topChip}>{capsule.distance_meters < 1 ? '<1m' : `${capsule.distance_meters.toFixed(0)}m`}</span>
          )}
        </div>
        {/* Delete own capsule */}
        {userId && capsule.created_by === userId && (
          <button style={st.reportBtn} onClick={() => {
            if (confirm('Apagar este portal permanentemente?')) {
              selfDestruct(capsule.id).catch(() => {});
              onDeleteOwn?.(capsule.id);
              onClose();
            }
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,51,102,0.6)" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m-1 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V6h10z" />
            </svg>
          </button>
        )}
        {onReport && !locked && userId && capsule.created_by !== userId && (
          <button style={st.reportBtn} onClick={() => { close(); onReport?.(capsule); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,51,102,0.6)" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </button>
        )}
      </div>

      {locked ? (
        <div style={st.lockedCenter}>
          <div style={st.lockedGlow} />
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🔒</div>
          <h2 style={{ color: '#b44aff', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.25em', margin: '0 0 12px' }}>TRANCADO</h2>
          <p style={{ color: '#8888a0', fontSize: '0.75rem', margin: '0 0 12px' }}>Volte em</p>
          <div style={{ color: '#b44aff', fontSize: '2.5rem', fontWeight: 700, textShadow: '0 0 30px rgba(180,74,255,0.4)' }}>{timeLeft || '...'}</div>
          <p style={{ color: '#6b6b80', fontSize: '0.65rem', marginTop: 14 }}>para desbloquear este portal</p>
        </div>
      ) : tooFar ? (
        /* ── Too far — must be within 10m ── */
        <div style={st.lockedCenter}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📍</div>
          <h2 style={{ color: '#00f0ff', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.15em', margin: '0 0 12px' }}>
            MUITO LONGE
          </h2>
          <p style={{ color: '#8888a0', fontSize: '0.75rem', textAlign: 'center', maxWidth: 260, lineHeight: 1.6, margin: '0 0 12px' }}>
            Voce precisa estar a menos de {OPEN_RADIUS}m deste portal para abri-lo.
          </p>
          <div style={{ color: '#00f0ff', fontSize: '2rem', fontWeight: 700, textShadow: '0 0 20px rgba(0,240,255,0.3)' }}>
            {dist < 1000 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`}
          </div>
          <p style={{ color: '#6b6b80', fontSize: '0.6rem', marginTop: 12 }}>
            Siga os indicadores direcionais para encontrar o portal
          </p>
        </div>
      ) : contentHidden ? (
        /* ── Chain blocked or Auction gate ── */
        <div style={st.lockedCenter}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>{chainBlocked ? '🔗' : '💎'}</div>
          <h2 style={{ color: accent, fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.15em', margin: '0 0 12px' }}>
            {chainBlocked ? 'CORRENTE' : 'LEILAO'}
          </h2>
          <p style={{ color: '#8888a0', fontSize: '0.75rem', textAlign: 'center', maxWidth: 260, lineHeight: 1.6, margin: '0 0 20px' }}>
            {chainBlocked
              ? 'Para abrir esta capsula, voce precisa deixar um portal neste local primeiro.'
              : typeInfo?.insufficient
                ? `Voce tem ${typeInfo.userXp} XP. Precisa de ${typeInfo.cost} XP para abrir.`
                : `Custa ${typeInfo?.cost || '?'} XP para revelar o conteudo. O XP vai para o criador.`
            }
          </p>
          {auctionGated && !typeInfo?.insufficient && (
            <button style={st.actionBtn} onClick={handleAuctionBid}>
              <span>💎 Pagar {typeInfo?.cost} XP</span>
            </button>
          )}
          {typeAction === 'loading' && <div style={st.miniSpin} />}
        </div>
      ) : (
        /* ── OPEN content ── */
        <div style={st.scrollArea}>
          {/* Media */}
          {capsule.media_type === 'image' && capsule.media_url && (
            <div style={st.mediaWrap}><img src={capsule.media_url} alt="" style={st.media} /></div>
          )}
          {capsule.media_type === 'video' && capsule.media_url && (
            <div style={st.mediaWrap}><video src={capsule.media_url} controls playsInline style={st.media} /></div>
          )}
          {capsule.media_type === 'audio' && capsule.media_url && (
            <div style={st.audioWrap}>
              <button style={st.audioBtn} onClick={() => {
                if (!audioRef.current) return;
                if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
                else { audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => {}); }
              }}>
                <div style={{ ...st.audioIcon, background: audioPlaying ? 'rgba(255,51,102,0.15)' : 'rgba(0,240,255,0.1)' }}>{audioPlaying ? '⏸' : '▶'}</div>
                <span>{audioPlaying ? 'Pausar audio' : 'Ouvir audio'}</span>
                <audio ref={audioRef} src={capsule.media_url} onEnded={() => setAudioPlaying(false)} />
              </button>
            </div>
          )}

          {/* Text */}
          {body && <div style={st.bodyWrap}><p style={hasMedia ? st.textWithMedia : st.textOnly}>{body}</p></div>}
          {!body && !capsule.media_url && (
            <div style={st.emptyWrap}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌀</div>
              <p style={{ color: '#6b6b80', fontSize: '0.8rem', fontStyle: 'italic' }}>Portal sem conteudo visivel</p>
            </div>
          )}

          {/* Ghost bar */}
          {ghost && viewsLeft !== null && (
            <div style={st.ghostWrap}>
              <div style={st.ghostTrack}>
                <div style={{ height: '100%', borderRadius: 2, background: viewsLeft <= 2 ? '#ff3366' : accent, width: `${Math.max(5, (viewsLeft / 10) * 100)}%`, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: '0.55rem', color: viewsLeft <= 2 ? '#ff3366' : '#6b6b80' }}>
                {viewsLeft <= 0 ? 'Ultima view — autodestruindo' : `${viewsLeft} views restantes`}
              </span>
            </div>
          )}

          {/* ── Type-specific action section ── */}
          {capsuleType === 'echo' && userId && (
            <div style={st.typeSection}>
              <div style={st.typeSectionHeader}>
                <span>📡 Eco</span>
                {typeInfo?.echoCount > 0 && <span style={st.echoCount}>Re-plantada {typeInfo.echoCount}x</span>}
              </div>
              <p style={st.typeSectionDesc}>Re-plante esta capsula na sua localizacao atual. O conteudo se espalha pelo mundo.</p>
              <button
                style={{ ...st.actionBtn, ...(typeAction === 'done' ? { opacity: 0.5 } : {}) }}
                onClick={handleEchoReplant}
                disabled={typeAction === 'done' || typeAction === 'loading'}
              >
                {typeAction === 'loading' ? <div style={st.miniSpin} /> : typeAction === 'done' ? '✓ Re-plantada!' : '📡 Re-plantar aqui'}
              </button>
            </div>
          )}

          {capsuleType === 'challenge' && userId && (
            <div style={st.typeSection}>
              <div style={st.typeSectionHeader}><span>🎯 Desafio</span></div>
              <p style={st.typeSectionDesc}>Complete a missao descrita acima e marque como feita para ganhar XP bonus.</p>
              <button
                style={{ ...st.actionBtn, ...(typeAction === 'done' ? { opacity: 0.5 } : {}) }}
                onClick={handleChallenge}
                disabled={typeAction === 'done' || typeAction === 'loading'}
              >
                {typeAction === 'loading' ? <div style={st.miniSpin} /> : typeAction === 'done' ? '✓ Desafio completo!' : '🎯 Completar desafio'}
              </button>
            </div>
          )}

          {capsuleType === 'collab' && (
            <div style={st.typeSection}>
              <div style={st.typeSectionHeader}>
                <span>🎨 Mural Coletivo</span>
                {collabEntries.length > 0 && <span style={st.echoCount}>{collabEntries.length} contribuicoes</span>}
              </div>
              {collabEntries.map((e) => (
                <div key={e.id} style={st.collabEntry}>
                  <span style={st.collabName}>{e.displayName}</span>
                  <p style={st.collabBody}>{e.body}</p>
                </div>
              ))}
              {userId && (
                <div style={st.collabInput}>
                  <input
                    style={st.input}
                    placeholder="Adicione ao mural..."
                    value={collabText}
                    onChange={(e) => setCollabText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCollabAdd(); } }}
                    maxLength={280}
                  />
                  <button style={{ ...st.sendBtn, opacity: collabText.trim() ? 1 : 0.3 }} onClick={handleCollabAdd} disabled={!collabText.trim() || sending}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00f0ff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Comments */}
          <div style={st.commentsSection}>
            <div style={st.commentsDivider} />
            <h3 style={st.commentsTitle}>Comentarios {comments.length > 0 && <span style={st.commentsCount}>{comments.length}</span>}</h3>
            {comments.length === 0 && <p style={st.noComments}>Nenhum comentario ainda. Seja o primeiro!</p>}
            {comments.map((c) => (
              <div key={c.id} style={st.comment}>
                <div style={st.commentAvatar}>
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" style={st.commentAvatarImg} /> : <span style={st.commentAvatarFallback}>{(c.displayName || '?')[0].toUpperCase()}</span>}
                </div>
                <div style={st.commentBody}>
                  <div style={st.commentHeader}>
                    <span style={st.commentName}>{c.displayName}</span>
                    <span style={st.commentTime}>{formatTimeAgo(c.createdAt)}</span>
                  </div>
                  <p style={st.commentText}>{c.body}</p>
                </div>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        </div>
      )}

      {/* Comment input */}
      {!locked && !contentHidden && userId && (
        <div style={st.inputBar}>
          <input ref={inputRef} style={st.input} placeholder="Deixe um comentario..." value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            maxLength={500} />
          <button style={{ ...st.sendBtn, opacity: commentText.trim() ? 1 : 0.3 }} onClick={handleSend} disabled={!commentText.trim() || sending}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 10002, background: '#0a0814', display: 'flex', flexDirection: 'column', pointerEvents: 'auto' },
  topBar: { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top))', background: 'linear-gradient(180deg, rgba(10,8,20,0.95) 0%, rgba(10,8,20,0.7) 100%)' },
  backBtn: { width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' },
  topInfo: { flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  topDate: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' },
  topChip: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' },
  reportBtn: { width: 38, height: 38, borderRadius: 12, background: 'rgba(255,51,102,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' },
  lockedCenter: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 32, position: 'relative' },
  lockedGlow: { position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,74,255,0.12), transparent 70%)', pointerEvents: 'none' },
  scrollArea: { flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' },
  mediaWrap: { width: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  media: { width: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block' },
  audioWrap: { padding: '24px 16px' },
  audioBtn: { width: '100%', padding: 16, borderRadius: 16, background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.1)', color: '#00f0ff', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12, touchAction: 'manipulation' },
  audioIcon: { width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' },
  bodyWrap: { padding: '16px 20px' },
  textWithMedia: { fontSize: '1rem', lineHeight: 1.7, color: '#e8e8f0', margin: 0, wordBreak: 'break-word' },
  textOnly: { fontSize: '1.25rem', lineHeight: 1.8, color: '#f0f0f8', margin: 0, wordBreak: 'break-word', padding: '40px 0' },
  emptyWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' },
  ghostWrap: { padding: '8px 20px 4px' },
  ghostTrack: { height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', marginBottom: 4 },

  // Type-specific sections
  typeSection: { padding: '12px 16px', margin: '0 16px 8px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' },
  typeSectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' },
  typeSectionDesc: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, margin: '0 0 12px' },
  actionBtn: {
    width: '100%', padding: '12px 16px', borderRadius: 12,
    background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.15)',
    color: '#00f0ff', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  echoCount: { fontSize: '0.55rem', color: 'rgba(0,240,255,0.4)', fontWeight: 600 },
  miniSpin: { width: 18, height: 18, border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff', borderRadius: '50%', animation: 'spin 0.6s linear infinite' },

  // Collab
  collabEntry: { padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' },
  collabName: { fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)' },
  collabBody: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', margin: '3px 0 0', lineHeight: 1.5 },
  collabInput: { display: 'flex', gap: 8, marginTop: 10 },

  // Comments
  commentsSection: { padding: '8px 16px 16px', minHeight: 120 },
  commentsDivider: { height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16 },
  commentsTitle: { fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 },
  commentsCount: { fontSize: '0.65rem', color: '#00f0ff', background: 'rgba(0,240,255,0.08)', padding: '1px 7px', borderRadius: 8 },
  noComments: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', textAlign: 'center', padding: '16px 0' },
  comment: { display: 'flex', gap: 10, marginBottom: 14 },
  commentAvatar: { width: 30, height: 30, borderRadius: 10, flexShrink: 0, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  commentAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  commentAvatarFallback: { fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)' },
  commentBody: { flex: 1, minWidth: 0 },
  commentHeader: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 },
  commentName: { fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' },
  commentTime: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' },
  commentText: { fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)', margin: 0, wordBreak: 'break-word' },
  inputBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'rgba(10,8,20,0.95)', borderTop: '1px solid rgba(255,255,255,0.06)' },
  input: { flex: 1, padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#f0f0f8', fontSize: '0.85rem', fontFamily: 'inherit', outline: 'none' },
  sendBtn: { width: 40, height: 40, borderRadius: 12, background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation', transition: 'opacity 0.2s' },
};
