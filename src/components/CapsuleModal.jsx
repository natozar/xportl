import React, { useEffect, useState, useRef } from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining, haptic, consumeView, selfDestruct } from '../services/capsules';
import { shareCapsule } from '../services/share';

export default function CapsuleModal({ capsule, onClose, onSelfDestruct, onReport }) {
  const [shareStatus, setShareStatus] = useState(null);
  const [viewsLeft, setViewsLeft] = useState(null);
  const [destroying, setDestroying] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);
  const consumedRef = useRef(false);

  if (!capsule) return null;

  const locked = isCapsuleLocked(capsule);
  const ghost = isGhostCapsule(capsule);
  const timeLeft = getTimeRemaining(capsule);
  const content = capsule.content || {};
  const distance = capsule.distance_meters;
  const accent = locked ? '#b44aff' : '#00ff88';
  const accentRgb = locked ? '180, 74, 255' : '0, 255, 136';

  // Consume a view on open (once per modal open, only for unlocked capsules)
  useEffect(() => {
    if (locked || consumedRef.current) return;
    consumedRef.current = true;

    (async () => {
      const result = await consumeView(capsule.id);
      setViewsLeft(result.views_left);
    })();

    haptic(locked ? [200, 100, 200] : [100, 50, 100]);

    return () => { consumedRef.current = false; };
  }, [capsule.id, locked]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleClose = async () => {
    // Check if capsule just died
    if (viewsLeft !== null && viewsLeft <= 0 && !destroying) {
      setDestroying(true);
      haptic([300, 100, 300, 100, 500]);

      // Wait for the visual effect
      await new Promise((r) => setTimeout(r, 2000));

      // Self-destruct
      await selfDestruct(capsule.id);
      if (onSelfDestruct) onSelfDestruct(capsule.id);
      onClose();
      return;
    }
    onClose();
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (audioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setAudioPlaying(!audioPlaying);
  };

  // ── Destroying overlay ──
  if (destroying) {
    return (
      <div style={st.backdrop}>
        <div style={st.destroyContainer}>
          <div style={st.destroyGlitch}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" style={{ animation: 'glitch-flicker 0.3s ease infinite' }}>
              <polygon points="12,2 22,8.5 19,20 5,20 2,8.5" stroke="#ff3366" strokeWidth="1.5" fill="rgba(255,51,102,0.1)" />
              <line x1="4" y1="4" x2="20" y2="20" stroke="#ff3366" strokeWidth="2" />
              <line x1="20" y1="4" x2="4" y2="20" stroke="#ff3366" strokeWidth="2" />
            </svg>
          </div>
          <p style={st.destroyText}>AUTODESTRUINDO...</p>
          <p style={st.destroySubtext}>Esta capsula esta sendo apagada para sempre</p>
          <div style={st.destroyBar}>
            <div style={st.destroyBarFill} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={st.backdrop} onClick={handleClose}>
      <div
        style={{
          ...st.modal,
          borderColor: `rgba(${accentRgb}, 0.2)`,
          boxShadow: `0 0 80px rgba(${accentRgb}, 0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...st.accentLine, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

        {/* Header */}
        <div style={st.header}>
          <div style={{ ...st.iconWrap, background: `rgba(${accentRgb}, 0.08)`, borderColor: `rgba(${accentRgb}, 0.15)` }}>
            {locked ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke={accent} strokeWidth="1.5" />
                <path d="M8 11V7a4 4 0 118 0v4" stroke={accent} strokeWidth="1.5" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <polygon points="12,2 22,8.5 19,20 5,20 2,8.5" stroke={accent} strokeWidth="1.5" fill={`rgba(${accentRgb}, 0.08)`} />
                <circle cx="12" cy="12" r="2.5" fill={accent} opacity="0.7" />
              </svg>
            )}
          </div>
          <div style={st.headerText}>
            <h2 style={{ ...st.title, color: accent, textShadow: `0 0 20px rgba(${accentRgb}, 0.3)` }}>
              {locked ? 'RASTRO TRANCADO' : 'CAPSULA DESBLOQUEADA'}
            </h2>
            <p style={st.subtitle}>
              {distance !== undefined ? `${distance < 1 ? '< 1' : distance.toFixed(1)}m` : '---'}
              {ghost && viewsLeft !== null && ` // ${viewsLeft} views restantes`}
            </p>
          </div>
          <button style={st.closeBtn} onClick={handleClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ ...st.divider, background: `linear-gradient(90deg, transparent, rgba(${accentRgb}, 0.15), transparent)` }} />

        {/* Content */}
        <div style={st.content}>
          {locked ? (
            <div style={st.lockedContent}>
              <p style={st.lockedMsg}>Rastro trancado temporariamente</p>
              <p style={st.lockedTime}>Volte a esta coordenada em</p>
              <div style={st.countdown}>
                <span style={st.countdownValue}>{timeLeft || '---'}</span>
              </div>
              <p style={st.lockedHint}>para desbloquear este misterio</p>
            </div>
          ) : (
            <>
              {/* Media: Image */}
              {capsule.media_type === 'image' && capsule.media_url && (
                <div style={st.mediaContainer}>
                  <img src={capsule.media_url} alt="Capsule media" style={st.mediaImg} />
                </div>
              )}

              {/* Media: Video */}
              {capsule.media_type === 'video' && capsule.media_url && (
                <div style={st.mediaContainer}>
                  <video
                    src={capsule.media_url}
                    style={st.mediaImg}
                    controls
                    playsInline
                    preload="metadata"
                  />
                </div>
              )}

              {/* Media: Audio */}
              {capsule.media_type === 'audio' && capsule.media_url && (
                <div style={st.audioPlayer}>
                  <button style={st.playBtn} onClick={toggleAudio}>
                    {audioPlaying ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <rect x="6" y="5" width="4" height="14" rx="1" fill="#00ff88" />
                        <rect x="14" y="5" width="4" height="14" rx="1" fill="#00ff88" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <polygon points="8,5 19,12 8,19" fill="#00ff88" />
                      </svg>
                    )}
                  </button>
                  <div style={st.waveform}>
                    {Array.from({ length: 24 }, (_, i) => (
                      <div key={i} style={{
                        ...st.waveBar,
                        height: `${20 + Math.sin(i * 0.8) * 15 + Math.random() * 10}%`,
                        animationDelay: `${i * 0.05}s`,
                        opacity: audioPlaying ? 1 : 0.3,
                      }} />
                    ))}
                  </div>
                  <audio
                    ref={audioRef}
                    src={capsule.media_url}
                    onEnded={() => setAudioPlaying(false)}
                  />
                </div>
              )}

              {/* Text */}
              {content.type === 'enigma' && <span style={st.enigmaTag}>ENIGMA</span>}
              <p style={st.messageText}>{content.body || JSON.stringify(content)}</p>
            </>
          )}
        </div>

        {/* Ghost bar */}
        {ghost && viewsLeft !== null && !locked && (
          <div style={st.ghostBar}>
            <div style={st.ghostBarTrack}>
              <div style={{
                ...st.ghostBarFill,
                width: `${Math.max(0, (viewsLeft / (capsule.views_left !== undefined ? Math.max(viewsLeft, 1) : 10)) * 100)}%`,
                background: viewsLeft <= 2 ? '#ff3366' : viewsLeft <= 5 ? '#ffaa00' : '#00ff88',
              }} />
            </div>
            <span style={{ ...st.ghostLabel, color: viewsLeft <= 2 ? '#ff3366' : 'var(--text-muted)' }}>
              {viewsLeft <= 0 ? 'ULTIMA VIEW' : `${viewsLeft} views antes da autodestruicao`}
            </span>
          </div>
        )}

        {/* Meta + Report */}
        <div style={st.meta}>
          <span style={st.metaChip}>{capsule.visibility_layer || 'public'}</span>
          {capsule.media_type && <span style={st.metaChip}>{capsule.media_type}</span>}
          {capsule.created_at && (
            <span style={st.metaChip}>{new Date(capsule.created_at).toLocaleDateString('pt-BR')}</span>
          )}
          {/* Share button */}
          {!locked && (
            <button
              style={st.shareBtn}
              onClick={async () => {
                const result = await shareCapsule(capsule);
                setShareStatus(result.method === 'clipboard' ? 'Link copiado!' : null);
                if (result.method === 'clipboard') setTimeout(() => setShareStatus(null), 2000);
              }}
            >
              {shareStatus || 'Compartilhar'}
            </button>
          )}
          {onReport && !locked && (
            <button
              style={st.reportBtn}
              onClick={() => onReport(capsule)}
            >
              Denunciar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const st = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20, pointerEvents: 'auto',
  },
  modal: {
    background: 'rgba(12,12,18,0.92)', backdropFilter: 'blur(40px)',
    border: '1px solid', borderRadius: 20, padding: '0 24px 24px',
    maxWidth: 380, width: '100%', overflow: 'hidden', maxHeight: '85vh', overflowY: 'auto',
  },
  accentLine: { height: 2, marginBottom: 20, marginLeft: -24, marginRight: -24 },
  header: { display: 'flex', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, border: '1px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em', margin: 0 },
  subtitle: { fontSize: '0.55rem', color: '#6b6b80', marginTop: 3 },
  closeBtn: {
    flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b80',
  },
  divider: { height: 1, margin: '18px -24px' },
  content: { minHeight: 60 },

  // ── Media ──
  mediaContainer: {
    borderRadius: 12, overflow: 'hidden', marginBottom: 14,
    border: '1px solid rgba(0,255,136,0.08)',
  },
  mediaImg: { width: '100%', maxHeight: 240, objectFit: 'cover', display: 'block' },

  // ── Audio player ──
  audioPlayer: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    background: 'rgba(0,255,136,0.03)', border: '1px solid rgba(0,255,136,0.08)',
    borderRadius: 12, marginBottom: 14,
  },
  playBtn: {
    width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,255,136,0.1)',
    border: '1px solid rgba(0,255,136,0.2)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, color: '#00ff88',
  },
  waveform: {
    flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 32,
  },
  waveBar: {
    flex: 1, background: '#00ff88', borderRadius: 1, minHeight: 2,
    transition: 'opacity 0.3s, height 0.2s',
  },

  // ── Text ──
  messageText: { fontSize: '1.1rem', lineHeight: 1.7, color: '#e8e8f0', fontWeight: 400 },
  enigmaTag: {
    display: 'inline-block', background: 'rgba(180,74,255,0.1)', border: '1px solid rgba(180,74,255,0.2)',
    color: '#b44aff', fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em',
    padding: '3px 10px', borderRadius: 6, marginBottom: 12,
  },

  // ── Locked ──
  lockedContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '8px 0' },
  lockedMsg: { fontSize: '0.85rem', fontWeight: 600, color: 'rgba(180,74,255,0.8)', marginBottom: 12 },
  lockedTime: { fontSize: '0.6rem', color: '#6b6b80', marginBottom: 6 },
  countdown: { padding: '8px 20px', background: 'rgba(180,74,255,0.06)', border: '1px solid rgba(180,74,255,0.12)', borderRadius: 10, marginBottom: 6 },
  countdownValue: { fontSize: '1.4rem', fontWeight: 700, color: '#b44aff', letterSpacing: '0.05em', textShadow: '0 0 20px rgba(180,74,255,0.3)' },
  lockedHint: { fontSize: '0.6rem', color: '#6b6b80' },

  // ── Ghost bar ──
  ghostBar: { marginTop: 14, marginBottom: 4 },
  ghostBarTrack: { height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  ghostBarFill: { height: '100%', borderRadius: 2, transition: 'width 0.5s ease' },
  ghostLabel: { fontSize: '0.5rem', marginTop: 4, display: 'block' },

  // ── Meta ──
  meta: { display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.03)' },
  metaChip: { fontSize: '0.5rem', color: '#6b6b80', background: 'rgba(255,255,255,0.03)', padding: '3px 8px', borderRadius: 6 },
  shareBtn: {
    marginLeft: 'auto', fontSize: '0.5rem', color: 'rgba(0,240,255,0.5)', background: 'none',
    border: '1px solid rgba(0,240,255,0.12)', borderRadius: 6, padding: '3px 10px',
    fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.05em',
  },
  reportBtn: {
    fontSize: '0.5rem', color: 'rgba(255,51,102,0.5)', background: 'none',
    border: '1px solid rgba(255,51,102,0.12)', borderRadius: 6, padding: '3px 10px',
    fontFamily: 'inherit', fontWeight: 600, letterSpacing: '0.05em',
  },

  // ── Destroy ──
  destroyContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  destroyGlitch: {
    marginBottom: 16, filter: 'drop-shadow(0 0 20px rgba(255,51,102,0.5))',
  },
  destroyText: {
    fontSize: '0.85rem', fontWeight: 700, color: '#ff3366', letterSpacing: '0.2em',
    textShadow: '0 0 20px rgba(255,51,102,0.4)', animation: 'glitch-flicker 0.5s ease infinite',
  },
  destroySubtext: { fontSize: '0.6rem', color: 'rgba(255,51,102,0.5)', marginTop: 6, marginBottom: 16 },
  destroyBar: {
    width: 200, height: 3, borderRadius: 2, background: 'rgba(255,51,102,0.15)', overflow: 'hidden',
  },
  destroyBarFill: {
    height: '100%', background: '#ff3366', borderRadius: 2,
    animation: 'destroy-fill 2s ease-in forwards',
  },
};

// Inject destroy animation
if (typeof document !== 'undefined' && !document.getElementById('xportl-destroy-keyframes')) {
  const style = document.createElement('style');
  style.id = 'xportl-destroy-keyframes';
  style.textContent = `@keyframes destroy-fill { from { width: 0; } to { width: 100%; } }`;
  document.head.appendChild(style);
}
