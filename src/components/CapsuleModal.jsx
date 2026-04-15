import React, { useEffect, useState, useRef } from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining, haptic, consumeView, selfDestruct } from '../services/capsules';

export default function CapsuleModal({ capsule, onClose, onSelfDestruct, onReport }) {
  const [viewsLeft, setViewsLeft] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);
  const consumedRef = useRef(false);

  // Reset state when capsule changes
  useEffect(() => {
    setViewsLeft(null);
    setAudioPlaying(false);
    consumedRef.current = false;
  }, [capsule?.id]);

  if (!capsule) return null;

  const locked = isCapsuleLocked(capsule);
  const ghost = isGhostCapsule(capsule);
  const timeLeft = getTimeRemaining(capsule);
  const content = capsule.content || {};
  const body = content.body || content.emoji || '';
  const accent = locked ? '#b44aff' : '#00f0ff';

  // Consume view
  useEffect(() => {
    if (!capsule || locked || consumedRef.current) return;
    consumedRef.current = true;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (!isFake) {
      consumeView(capsule.id).then((r) => setViewsLeft(r?.views_left ?? null)).catch(() => {});
    }
    haptic([60, 30, 60]);
  }, [capsule?.id, locked]);

  const close = () => {
    if (viewsLeft !== null && viewsLeft <= 0) {
      setTimeout(() => { selfDestruct(capsule.id).catch(() => {}); onSelfDestruct?.(capsule.id); }, 300);
    }
    onClose();
  };

  return (
    <div style={st.bg} onClick={close}>
      <div style={st.card} onClick={e => e.stopPropagation()}>

        {/* Glow top */}
        <div style={{ height: 3, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, borderRadius: '20px 20px 0 0' }} />

        {/* Close X */}
        <button style={st.x} onClick={close}>✕</button>

        {locked ? (
          /* ── LOCKED ── */
          <div style={st.lockedWrap}>
            <div style={st.lockedIcon}>🔒</div>
            <h2 style={{ color: '#b44aff', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.2em', margin: '0 0 8px' }}>TRANCADO</h2>
            <p style={{ color: '#8888a0', fontSize: '0.75rem', margin: '0 0 10px' }}>Volte em</p>
            <div style={{ color: '#b44aff', fontSize: '2rem', fontWeight: 700, textShadow: '0 0 20px rgba(180,74,255,0.3)' }}>{timeLeft || '...'}</div>
            <p style={{ color: '#6b6b80', fontSize: '0.6rem', marginTop: 10 }}>para desbloquear este misterio</p>
          </div>
        ) : (
          /* ── OPEN ── */
          <div style={st.contentWrap}>
            {/* Media */}
            {capsule.media_type === 'image' && capsule.media_url && (
              <img src={capsule.media_url} alt="" style={st.img} />
            )}
            {capsule.media_type === 'video' && capsule.media_url && (
              <video src={capsule.media_url} controls playsInline style={st.img} />
            )}
            {capsule.media_type === 'audio' && capsule.media_url && (
              <button style={st.audioBtn} onClick={() => {
                if (!audioRef.current) return;
                if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
                else { audioRef.current.play().then(() => setAudioPlaying(true)).catch(() => {}); }
              }}>
                {audioPlaying ? '⏸ Pausar' : '▶ Ouvir'}
                <audio ref={audioRef} src={capsule.media_url} onEnded={() => setAudioPlaying(false)} />
              </button>
            )}

            {/* Text */}
            {body && <p style={st.text}>{body}</p>}

            {/* No content fallback */}
            {!body && !capsule.media_url && (
              <p style={{ color: '#6b6b80', fontSize: '0.8rem', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
                Portal sem conteudo visivel
              </p>
            )}
          </div>
        )}

        {/* Ghost bar */}
        {ghost && viewsLeft !== null && !locked && (
          <div style={st.ghostWrap}>
            <div style={st.ghostTrack}>
              <div style={{ height: '100%', borderRadius: 2, background: viewsLeft <= 2 ? '#ff3366' : accent, width: `${Math.max(5, (viewsLeft / 10) * 100)}%`, transition: 'width 0.5s' }} />
            </div>
            <span style={{ fontSize: '0.5rem', color: viewsLeft <= 2 ? '#ff3366' : '#6b6b80' }}>
              {viewsLeft <= 0 ? 'Ultima view — autodestruindo' : `${viewsLeft} views restantes`}
            </span>
          </div>
        )}

        {/* Footer */}
        <div style={st.footer}>
          <span style={st.chip}>{capsule.visibility_layer || 'public'}</span>
          {capsule.distance_meters !== undefined && (
            <span style={st.chip}>{capsule.distance_meters < 1 ? '<1m' : `${capsule.distance_meters.toFixed(0)}m`}</span>
          )}
          {capsule.created_at && <span style={st.chip}>{new Date(capsule.created_at).toLocaleDateString('pt-BR')}</span>}
          {onReport && !locked && (
            <button style={st.reportBtn} onClick={() => { close(); onReport?.(capsule); }}>Denunciar</button>
          )}
        </div>

        {/* Close button */}
        <button style={st.closeBtn} onClick={close}>Fechar</button>
      </div>
    </div>
  );
}

const st = {
  bg: {
    position: 'fixed', inset: 0, zIndex: 10002,
    background: 'rgba(5,3,16,0.93)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, pointerEvents: 'auto',
  },
  card: {
    position: 'relative', width: '100%', maxWidth: 400,
    maxHeight: '85vh', overflowY: 'auto',
    background: '#0d0a1a', borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
  },
  x: {
    position: 'absolute', top: 12, right: 12, zIndex: 2,
    width: 34, height: 34, borderRadius: 10,
    background: 'rgba(255,255,255,0.06)', border: 'none',
    color: '#888', fontSize: '0.9rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', pointerEvents: 'auto', touchAction: 'manipulation',
  },
  lockedWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '32px 20px 20px', textAlign: 'center',
  },
  lockedIcon: { fontSize: '2.5rem', marginBottom: 12 },
  contentWrap: { padding: '16px 16px 8px' },
  img: {
    width: '100%', borderRadius: 14, marginBottom: 12,
    display: 'block', background: '#000', maxHeight: 300, objectFit: 'contain',
  },
  audioBtn: {
    width: '100%', padding: 14, borderRadius: 14, marginBottom: 12,
    background: 'rgba(0,240,255,0.05)', border: '1px solid rgba(0,240,255,0.1)',
    color: '#00f0ff', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  text: {
    fontSize: '1.05rem', lineHeight: 1.7, color: '#f0f0f8', margin: '0 0 8px',
    wordBreak: 'break-word',
  },
  ghostWrap: { padding: '0 16px 8px' },
  ghostTrack: { height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', marginBottom: 4 },
  footer: {
    display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 16px 8px',
  },
  chip: {
    fontSize: '0.5rem', color: '#6b6b80', background: 'rgba(255,255,255,0.03)',
    padding: '3px 10px', borderRadius: 8,
  },
  reportBtn: {
    fontSize: '0.5rem', color: 'rgba(255,51,102,0.5)', background: 'none',
    border: '1px solid rgba(255,51,102,0.1)', borderRadius: 8, padding: '3px 10px',
    fontFamily: 'inherit', marginLeft: 'auto', pointerEvents: 'auto',
  },
  closeBtn: {
    width: 'calc(100% - 32px)', margin: '4px 16px 16px', padding: 14,
    borderRadius: 14, background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#e8e8f0', fontSize: '0.85rem', fontWeight: 600,
    fontFamily: 'inherit', touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto',
  },
};
