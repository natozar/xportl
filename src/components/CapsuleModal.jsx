import React, { useEffect, useState, useRef } from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining, haptic, consumeView, selfDestruct } from '../services/capsules';

export default function CapsuleModal({ capsule, onClose, onSelfDestruct, onReport }) {
  const [phase, setPhase] = useState('reveal'); // reveal → content
  const [viewsLeft, setViewsLeft] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);
  const consumedRef = useRef(false);

  if (!capsule) return null;

  const locked = isCapsuleLocked(capsule);
  const ghost = isGhostCapsule(capsule);
  const timeLeft = getTimeRemaining(capsule);
  const content = capsule.content || {};
  const accent = locked ? '#b44aff' : '#00f0ff';
  const accentRgb = locked ? '180,74,255' : '0,240,255';

  // Reveal animation → show content after 1.2s
  useEffect(() => {
    setPhase('reveal');
    haptic(locked ? [200, 80, 200] : [60, 30, 60, 30, 120]);
    const t = setTimeout(() => setPhase('content'), locked ? 1500 : 1200);
    return () => clearTimeout(t);
  }, [capsule.id]);

  // Consume view
  useEffect(() => {
    if (locked || consumedRef.current || phase !== 'content') return;
    consumedRef.current = true;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (!isFake) {
      consumeView(capsule.id).then((r) => setViewsLeft(r?.views_left ?? null)).catch(() => {});
    }
    return () => { consumedRef.current = false; };
  }, [capsule.id, locked, phase]);

  const handleClose = () => {
    if (viewsLeft !== null && viewsLeft <= 0) {
      setTimeout(() => {
        selfDestruct(capsule.id).catch(() => {});
        if (onSelfDestruct) onSelfDestruct(capsule.id);
      }, 500);
    }
    onClose();
  };

  // ── PHASE 1: REVEAL ANIMATION ──
  if (phase === 'reveal') {
    return (
      <div style={st.fullscreen} onClick={handleClose}>
        <div style={st.revealContainer}>
          {/* Pulsing rings */}
          <div style={{ ...st.ring, width: 160, height: 160, animationDuration: '1.5s', borderColor: `rgba(${accentRgb},0.15)` }} />
          <div style={{ ...st.ring, width: 120, height: 120, animationDuration: '1.2s', animationDelay: '0.2s', borderColor: `rgba(${accentRgb},0.25)` }} />
          <div style={{ ...st.ring, width: 80, height: 80, animationDuration: '0.9s', animationDelay: '0.4s', borderColor: `rgba(${accentRgb},0.4)` }} />

          {/* Core */}
          <div style={{ ...st.revealCore, background: accent, boxShadow: `0 0 40px ${accent}, 0 0 80px rgba(${accentRgb},0.3)` }}>
            {locked ? '🔒' : '✦'}
          </div>

          {/* Text */}
          <div style={{ ...st.revealText, color: accent }}>
            {locked ? 'RASTRO TRANCADO' : 'PORTAL ENCONTRADO'}
          </div>
          <div style={st.revealSub}>
            {locked ? 'Trava temporal ativa' : 'Desbloqueando...'}
          </div>
        </div>
      </div>
    );
  }

  // ── PHASE 2: CONTENT ──
  return (
    <div style={st.fullscreen} onClick={handleClose}>
      <div style={st.card} onClick={(e) => e.stopPropagation()}>

        {/* Accent glow line */}
        <div style={{ ...st.glowLine, background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />

        {/* Header */}
        <div style={st.header}>
          <div style={{ ...st.headerIcon, borderColor: `rgba(${accentRgb},0.3)`, boxShadow: `0 0 20px rgba(${accentRgb},0.15)` }}>
            <span style={{ fontSize: '1.2rem' }}>{locked ? '🔒' : '✦'}</span>
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ ...st.title, color: accent }}>{locked ? 'TRANCADO' : 'PORTAL'}</h2>
            <p style={st.subtitle}>
              {capsule.distance_meters !== undefined && `${capsule.distance_meters < 1 ? '<1' : capsule.distance_meters.toFixed(0)}m`}
              {ghost && viewsLeft !== null && ` · ${viewsLeft} restantes`}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ ...st.divider, background: `linear-gradient(90deg, transparent, rgba(${accentRgb},0.12), transparent)` }} />

        {/* Body */}
        {locked ? (
          <div style={st.lockedBody}>
            <div style={st.lockedEmoji}>⏳</div>
            <p style={st.lockedTitle}>Volte a esta coordenada em</p>
            <div style={st.countdown}>{timeLeft || '...'}</div>
            <p style={st.lockedHint}>para desbloquear este misterio</p>
          </div>
        ) : (
          <div style={st.contentBody}>
            {/* Image */}
            {capsule.media_type === 'image' && capsule.media_url && (
              <img src={capsule.media_url} alt="" style={st.media} />
            )}
            {/* Video */}
            {capsule.media_type === 'video' && capsule.media_url && (
              <video src={capsule.media_url} controls playsInline style={st.media} />
            )}
            {/* Audio */}
            {capsule.media_type === 'audio' && capsule.media_url && (
              <button style={st.playBtn} onClick={() => {
                if (!audioRef.current) return;
                if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
                else { audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => {}); }
              }}>
                <span style={{ fontSize: '1.2rem' }}>{audioPlaying ? '⏸' : '▶'}</span>
                <span>{audioPlaying ? 'Pausar' : 'Ouvir mensagem'}</span>
                <audio ref={audioRef} src={capsule.media_url} onEnded={() => setAudioPlaying(false)} />
              </button>
            )}

            {/* Message */}
            <p style={st.message}>{content.body || ''}</p>
          </div>
        )}

        {/* Ghost progress */}
        {ghost && viewsLeft !== null && !locked && (
          <div style={st.ghostSection}>
            <div style={st.ghostTrack}>
              <div style={{ ...st.ghostFill, width: `${Math.max(5, (viewsLeft / 10) * 100)}%`, background: viewsLeft <= 2 ? '#ff3366' : accent }} />
            </div>
            <span style={{ fontSize: '0.5rem', color: viewsLeft <= 2 ? '#ff3366' : '#6b6b80', marginTop: 4, display: 'block' }}>
              {viewsLeft <= 0 ? 'Ultima visualizacao — autodestruindo' : `${viewsLeft} views antes da autodestruicao`}
            </span>
          </div>
        )}

        {/* Footer */}
        <div style={st.footer}>
          <span style={st.chip}>{capsule.visibility_layer}</span>
          {capsule.created_at && <span style={st.chip}>{new Date(capsule.created_at).toLocaleDateString('pt-BR')}</span>}
          {onReport && !locked && (
            <button style={st.reportBtn} onClick={() => { onClose(); onReport(capsule); }}>Denunciar</button>
          )}
        </div>

        {/* Close */}
        <button style={st.closeBtn} onClick={handleClose}>
          Fechar e voltar
        </button>
      </div>
    </div>
  );
}

const st = {
  // ── Fullscreen backdrop ──
  fullscreen: {
    position: 'fixed', inset: 0, zIndex: 10002,
    background: 'rgba(7,4,15,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, pointerEvents: 'auto', touchAction: 'manipulation',
    animation: 'fadeIn 0.3s ease',
  },

  // ── Reveal phase ──
  revealContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    position: 'relative', width: 200, height: 200,
  },
  ring: {
    position: 'absolute', borderRadius: '50%',
    border: '2px solid', animation: 'pulse-ring 1.5s ease-out infinite',
  },
  revealCore: {
    width: 56, height: 56, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.5rem', zIndex: 2,
    animation: 'fadeIn 0.5s ease 0.3s both',
  },
  revealText: {
    marginTop: 24, fontSize: '0.8rem', fontWeight: 700,
    letterSpacing: '0.25em', zIndex: 2,
    animation: 'fadeIn 0.5s ease 0.6s both',
  },
  revealSub: {
    marginTop: 6, fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)',
    animation: 'fadeIn 0.5s ease 0.8s both',
  },

  // ── Content card ──
  card: {
    width: '100%', maxWidth: 400, maxHeight: '85vh', overflowY: 'auto',
    background: '#0d0a1a', borderRadius: 24,
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    pointerEvents: 'auto',
    animation: 'fadeIn 0.3s ease',
  },
  glowLine: {
    height: 2, borderRadius: '24px 24px 0 0',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '20px 20px 0',
  },
  headerIcon: {
    width: 48, height: 48, borderRadius: 14,
    border: '1.5px solid', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,255,255,0.02)', flexShrink: 0,
  },
  title: {
    fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em', margin: 0,
  },
  subtitle: {
    fontSize: '0.58rem', color: '#6b6b80', marginTop: 3,
  },
  divider: {
    height: 1, margin: '16px 0',
  },

  // ── Locked ──
  lockedBody: {
    textAlign: 'center', padding: '12px 20px 20px',
  },
  lockedEmoji: { fontSize: '2.5rem', marginBottom: 10 },
  lockedTitle: { fontSize: '0.75rem', color: 'rgba(180,74,255,0.7)', marginBottom: 8 },
  countdown: {
    fontSize: '1.8rem', fontWeight: 700, color: '#b44aff',
    textShadow: '0 0 20px rgba(180,74,255,0.3)',
    padding: '8px 0', letterSpacing: '0.05em',
  },
  lockedHint: { fontSize: '0.6rem', color: '#6b6b80', marginTop: 4 },

  // ── Content ──
  contentBody: { padding: '0 20px 16px' },
  media: {
    width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 14,
    marginBottom: 14, display: 'block', background: '#000',
  },
  playBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px', borderRadius: 14, marginBottom: 14,
    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.1)',
    color: '#00f0ff', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'inherit',
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  message: {
    fontSize: '1.1rem', lineHeight: 1.7, color: '#f0f0f8', fontWeight: 400,
    margin: 0,
  },

  // ── Ghost ──
  ghostSection: { padding: '0 20px 12px' },
  ghostTrack: { height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  ghostFill: { height: '100%', borderRadius: 2, transition: 'width 0.5s' },

  // ── Footer ──
  footer: {
    display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 20px 10px',
  },
  chip: {
    fontSize: '0.5rem', color: '#6b6b80', background: 'rgba(255,255,255,0.03)',
    padding: '4px 10px', borderRadius: 8,
  },
  reportBtn: {
    fontSize: '0.5rem', color: 'rgba(255,51,102,0.5)', background: 'none',
    border: '1px solid rgba(255,51,102,0.1)', borderRadius: 8, padding: '4px 10px',
    fontFamily: 'inherit', marginLeft: 'auto', pointerEvents: 'auto',
    touchAction: 'manipulation',
  },

  // ── Close ──
  closeBtn: {
    width: 'calc(100% - 40px)', margin: '4px 20px 20px', padding: '15px',
    borderRadius: 16, background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e8e8f0', fontSize: '0.85rem', fontWeight: 600,
    fontFamily: 'inherit', touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto',
  },
};
