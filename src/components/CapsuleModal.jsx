import { useEffect, useState, useRef, useCallback } from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining, haptic, consumeView, selfDestruct } from '../services/capsules';
import { getComments, addComment } from '../services/comments';
import { supabase } from '../services/supabase';

export default function CapsuleModal({ capsule, onClose, onSelfDestruct, onReport }) {
  const [viewsLeft, setViewsLeft] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState(null);
  const audioRef = useRef(null);
  const consumedRef = useRef(false);
  const commentsEndRef = useRef(null);
  const inputRef = useRef(null);

  const locked = capsule ? isCapsuleLocked(capsule) : false;
  const ghost = capsule ? isGhostCapsule(capsule) : false;
  const timeLeft = capsule ? getTimeRemaining(capsule) : null;
  const content = capsule?.content || {};
  const body = content.body || content.emoji || '';
  const accent = locked ? '#b44aff' : '#00f0ff';

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  // Reset state when capsule changes
  useEffect(() => {
    setViewsLeft(null);
    setAudioPlaying(false);
    setComments([]);
    setCommentText('');
    consumedRef.current = false;
  }, [capsule?.id]);

  // Consume view
  useEffect(() => {
    if (!capsule || locked || consumedRef.current) return;
    consumedRef.current = true;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (!isFake) {
      consumeView(capsule.id).then((r) => setViewsLeft(r?.views_left ?? null)).catch(() => {});
    }
    haptic([60, 30, 60]);
  }, [capsule, locked]);

  // Load comments
  useEffect(() => {
    if (!capsule || locked) return;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (isFake) return;
    getComments(capsule.id).then(setComments).catch(() => {});
  }, [capsule, locked]);

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  const handleSend = useCallback(async () => {
    if (!commentText.trim() || !capsule || !userId || sending) return;
    setSending(true);
    try {
      const result = await addComment(capsule.id, userId, commentText);
      if (result) {
        setComments((prev) => [...prev, {
          id: result.id,
          body: result.body,
          createdAt: result.created_at,
          userId: result.user_id,
          displayName: 'Voce',
          avatarUrl: null,
        }]);
        setCommentText('');
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }, [commentText, capsule, userId, sending]);

  // Early return AFTER all hooks
  if (!capsule) return null;

  const close = () => {
    if (viewsLeft !== null && viewsLeft <= 0) {
      setTimeout(() => { selfDestruct(capsule.id).catch(() => {}); onSelfDestruct?.(capsule.id); }, 300);
    }
    onClose();
  };

  const hasMedia = capsule.media_url && (capsule.media_type === 'image' || capsule.media_type === 'video');

  return (
    <div style={st.overlay}>
      {/* Top bar */}
      <div style={st.topBar}>
        <button style={st.backBtn} onClick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div style={st.topInfo}>
          {capsule.created_at && (
            <span style={st.topDate}>{new Date(capsule.created_at).toLocaleDateString('pt-BR')}</span>
          )}
          <span style={{ ...st.topChip, borderColor: `${accent}33`, color: accent }}>
            {capsule.visibility_layer || 'public'}
          </span>
          {capsule.distance_meters !== undefined && (
            <span style={st.topChip}>
              {capsule.distance_meters < 1 ? '<1m' : `${capsule.distance_meters.toFixed(0)}m`}
            </span>
          )}
        </div>
        {onReport && !locked && (
          <button style={st.reportBtn} onClick={() => { close(); onReport?.(capsule); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,51,102,0.6)" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
          </button>
        )}
      </div>

      {locked ? (
        /* ── LOCKED ── */
        <div style={st.lockedCenter}>
          <div style={st.lockedGlow} />
          <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🔒</div>
          <h2 style={{ color: '#b44aff', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.25em', margin: '0 0 12px' }}>TRANCADO</h2>
          <p style={{ color: '#8888a0', fontSize: '0.75rem', margin: '0 0 12px' }}>Volte em</p>
          <div style={{ color: '#b44aff', fontSize: '2.5rem', fontWeight: 700, textShadow: '0 0 30px rgba(180,74,255,0.4)' }}>
            {timeLeft || '...'}
          </div>
          <p style={{ color: '#6b6b80', fontSize: '0.65rem', marginTop: 14 }}>para desbloquear este portal</p>
        </div>
      ) : (
        /* ── OPEN (scrollable content) ── */
        <div style={st.scrollArea}>
          {/* Media: fullscreen hero */}
          {capsule.media_type === 'image' && capsule.media_url && (
            <div style={st.mediaWrap}>
              <img src={capsule.media_url} alt="" style={st.media} />
            </div>
          )}
          {capsule.media_type === 'video' && capsule.media_url && (
            <div style={st.mediaWrap}>
              <video src={capsule.media_url} controls playsInline style={st.media} />
            </div>
          )}
          {capsule.media_type === 'audio' && capsule.media_url && (
            <div style={st.audioWrap}>
              <button style={st.audioBtn} onClick={() => {
                if (!audioRef.current) return;
                if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
                else { audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => {}); }
              }}>
                <div style={{ ...st.audioIcon, background: audioPlaying ? 'rgba(255,51,102,0.15)' : 'rgba(0,240,255,0.1)' }}>
                  {audioPlaying ? '⏸' : '▶'}
                </div>
                <span>{audioPlaying ? 'Pausar audio' : 'Ouvir audio'}</span>
                <audio ref={audioRef} src={capsule.media_url} onEnded={() => setAudioPlaying(false)} />
              </button>
            </div>
          )}

          {/* Text body */}
          {body && (
            <div style={st.bodyWrap}>
              <p style={hasMedia ? st.textWithMedia : st.textOnly}>{body}</p>
            </div>
          )}

          {/* No content fallback */}
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

          {/* ── Comments section ── */}
          <div style={st.commentsSection}>
            <div style={st.commentsDivider} />
            <h3 style={st.commentsTitle}>
              Comentarios {comments.length > 0 && <span style={st.commentsCount}>{comments.length}</span>}
            </h3>

            {comments.length === 0 && (
              <p style={st.noComments}>Nenhum comentario ainda. Seja o primeiro!</p>
            )}

            {comments.map((c) => (
              <div key={c.id} style={st.comment}>
                <div style={st.commentAvatar}>
                  {c.avatarUrl
                    ? <img src={c.avatarUrl} alt="" style={st.commentAvatarImg} />
                    : <span style={st.commentAvatarFallback}>{(c.displayName || '?')[0].toUpperCase()}</span>
                  }
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

      {/* ── Comment input bar (only when unlocked) ── */}
      {!locked && userId && (
        <div style={st.inputBar}>
          <input
            ref={inputRef}
            style={st.input}
            placeholder="Deixe um comentario..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            maxLength={500}
          />
          <button
            style={{ ...st.sendBtn, opacity: commentText.trim() ? 1 : 0.3 }}
            onClick={handleSend}
            disabled={!commentText.trim() || sending}
          >
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
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 10002,
    background: '#0a0814',
    display: 'flex', flexDirection: 'column',
    pointerEvents: 'auto',
  },

  // Top bar
  topBar: {
    position: 'relative', zIndex: 2,
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 16px',
    paddingTop: 'max(12px, env(safe-area-inset-top))',
    background: 'linear-gradient(180deg, rgba(10,8,20,0.95) 0%, rgba(10,8,20,0.7) 100%)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    background: 'rgba(255,255,255,0.06)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  topInfo: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  topDate: {
    fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)',
  },
  topChip: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)',
    padding: '2px 8px', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.08)',
  },
  reportBtn: {
    width: 38, height: 38, borderRadius: 12,
    background: 'rgba(255,51,102,0.06)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation',
  },

  // Locked state
  lockedCenter: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', padding: 32, position: 'relative',
  },
  lockedGlow: {
    position: 'absolute', width: 200, height: 200, borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(180,74,255,0.12), transparent 70%)',
    pointerEvents: 'none',
  },

  // Scrollable content
  scrollArea: {
    flex: 1, overflowY: 'auto', overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
  },

  // Media
  mediaWrap: {
    width: '100%', background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 200,
  },
  media: {
    width: '100%', maxHeight: '60vh', objectFit: 'contain', display: 'block',
  },

  // Audio
  audioWrap: { padding: '24px 16px' },
  audioBtn: {
    width: '100%', padding: 16, borderRadius: 16,
    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.1)',
    color: '#00f0ff', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 12,
    touchAction: 'manipulation',
  },
  audioIcon: {
    width: 40, height: 40, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.1rem',
  },

  // Text
  bodyWrap: { padding: '16px 20px' },
  textWithMedia: {
    fontSize: '1rem', lineHeight: 1.7, color: '#e8e8f0',
    margin: 0, wordBreak: 'break-word',
  },
  textOnly: {
    fontSize: '1.25rem', lineHeight: 1.8, color: '#f0f0f8',
    margin: 0, wordBreak: 'break-word',
    padding: '40px 0',
  },

  // Empty
  emptyWrap: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '60px 20px', textAlign: 'center',
  },

  // Ghost
  ghostWrap: { padding: '8px 20px 4px' },
  ghostTrack: { height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', marginBottom: 4 },

  // Comments
  commentsSection: { padding: '8px 16px 16px', minHeight: 120 },
  commentsDivider: {
    height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 16,
  },
  commentsTitle: {
    fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.08em', margin: '0 0 12px',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  commentsCount: {
    fontSize: '0.65rem', color: '#00f0ff',
    background: 'rgba(0,240,255,0.08)', padding: '1px 7px', borderRadius: 8,
  },
  noComments: {
    fontSize: '0.75rem', color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
    textAlign: 'center', padding: '16px 0',
  },

  // Single comment
  comment: {
    display: 'flex', gap: 10, marginBottom: 14,
  },
  commentAvatar: {
    width: 30, height: 30, borderRadius: 10, flexShrink: 0,
    background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  commentAvatarFallback: {
    fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)',
  },
  commentBody: { flex: 1, minWidth: 0 },
  commentHeader: {
    display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2,
  },
  commentName: {
    fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)',
  },
  commentTime: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)',
  },
  commentText: {
    fontSize: '0.8rem', lineHeight: 1.5, color: 'rgba(255,255,255,0.75)',
    margin: 0, wordBreak: 'break-word',
  },

  // Input bar
  inputBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px',
    paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
    background: 'rgba(10,8,20,0.95)',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  input: {
    flex: 1, padding: '10px 14px', borderRadius: 14,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#f0f0f8', fontSize: '0.85rem', fontFamily: 'inherit',
    outline: 'none',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'rgba(0,240,255,0.08)',
    border: '1px solid rgba(0,240,255,0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation', transition: 'opacity 0.2s',
  },
};
