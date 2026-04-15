import React, { useEffect, useState, useRef } from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining, haptic, consumeView, selfDestruct } from '../services/capsules';
import { shareCapsule } from '../services/share';

export default function CapsuleModal({ capsule, onClose, onSelfDestruct, onReport }) {
  const [viewsLeft, setViewsLeft] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(null);
  const consumedRef = useRef(false);

  if (!capsule) return null;

  const locked = isCapsuleLocked(capsule);
  const ghost = isGhostCapsule(capsule);
  const timeLeft = getTimeRemaining(capsule);
  const content = capsule.content || {};
  const distance = capsule.distance_meters;
  const accent = locked ? '#b44aff' : '#00f0ff';

  // Consume view on open (skip synthetic IDs)
  useEffect(() => {
    if (locked || consumedRef.current) return;
    consumedRef.current = true;
    const isFake = capsule.id?.startsWith('created_') || capsule.id?.startsWith('local_');
    if (!isFake) {
      consumeView(capsule.id).then((r) => setViewsLeft(r?.views_left ?? null)).catch(() => {});
    }
    haptic([80, 40, 80]);
    return () => { consumedRef.current = false; };
  }, [capsule.id, locked]);

  const handleClose = () => {
    // Ghost self-destruct in background
    if (viewsLeft !== null && viewsLeft <= 0) {
      setTimeout(() => {
        selfDestruct(capsule.id).catch(() => {});
        if (onSelfDestruct) onSelfDestruct(capsule.id);
      }, 500);
    }
    onClose();
  };

  const toggleAudio = async () => {
    if (!audioRef.current) return;
    try {
      if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
      else { await audioRef.current.play(); setAudioPlaying(true); }
    } catch (_) { setAudioPlaying(false); }
  };

  return (
    <div style={s.backdrop} onClick={handleClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={s.header}>
          <div style={{ ...s.dot, background: accent }} />
          <div style={s.headerText}>
            <div style={{ ...s.title, color: accent }}>
              {locked ? 'TRANCADO' : 'PORTAL'}
            </div>
            <div style={s.subtitle}>
              {distance !== undefined ? `${distance < 1 ? '<1' : distance.toFixed(0)}m` : ''}
              {ghost && viewsLeft !== null && ` · ${viewsLeft} views`}
            </div>
          </div>
          <button style={s.closeX} onClick={handleClose}>x</button>
        </div>

        {/* Content */}
        <div style={s.body}>
          {locked ? (
            <div style={s.lockedBox}>
              <div style={s.lockedIcon}>🔒</div>
              <p style={s.lockedText}>Rastro trancado temporariamente</p>
              <p style={s.lockedTime}>{timeLeft || 'em breve'}</p>
            </div>
          ) : (
            <>
              {/* Media */}
              {capsule.media_type === 'image' && capsule.media_url && (
                <img src={capsule.media_url} alt="" style={s.mediaImg} />
              )}
              {capsule.media_type === 'video' && capsule.media_url && (
                <video src={capsule.media_url} controls playsInline style={s.mediaImg} />
              )}
              {capsule.media_type === 'audio' && capsule.media_url && (
                <button style={s.audioBtn} onClick={toggleAudio}>
                  {audioPlaying ? '⏸ Pausar' : '▶ Ouvir audio'}
                  <audio ref={audioRef} src={capsule.media_url} onEnded={() => setAudioPlaying(false)} />
                </button>
              )}

              {/* Text */}
              <p style={s.messageText}>{content.body || JSON.stringify(content)}</p>
            </>
          )}
        </div>

        {/* Ghost bar */}
        {ghost && viewsLeft !== null && !locked && (
          <div style={s.ghostBar}>
            <div style={{ ...s.ghostFill, width: `${Math.max(5, (viewsLeft / 10) * 100)}%`, background: viewsLeft <= 2 ? '#ff3366' : '#00f0ff' }} />
          </div>
        )}

        {/* Meta */}
        <div style={s.meta}>
          <span style={s.chip}>{capsule.visibility_layer || 'public'}</span>
          {capsule.created_at && <span style={s.chip}>{new Date(capsule.created_at).toLocaleDateString('pt-BR')}</span>}
          {onReport && !locked && (
            <button style={s.reportChip} onClick={() => { onClose(); if (onReport) onReport(capsule); }}>Denunciar</button>
          )}
        </div>

        {/* Close button — big, obvious */}
        <button style={s.closeBtn} onClick={handleClose}>
          Fechar e voltar
        </button>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10002, padding: 16,
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  modal: {
    width: '100%', maxWidth: 380, maxHeight: '80vh', overflowY: 'auto',
    background: '#0d0a1a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20, padding: 20,
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
  },
  dot: {
    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
    boxShadow: '0 0 10px currentColor',
  },
  headerText: { flex: 1 },
  title: { fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.15em' },
  subtitle: { fontSize: '0.55rem', color: '#6b6b80', marginTop: 2 },
  closeX: {
    width: 32, height: 32, borderRadius: 10,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#6b6b80', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'inherit', pointerEvents: 'auto', touchAction: 'manipulation',
  },
  body: { marginBottom: 12 },
  messageText: {
    fontSize: '1rem', lineHeight: 1.7, color: '#e8e8f0',
  },
  mediaImg: {
    width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12,
    marginBottom: 10, display: 'block',
  },
  audioBtn: {
    width: '100%', padding: '12px', borderRadius: 12, marginBottom: 10,
    background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.12)',
    color: '#00f0ff', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'inherit',
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  lockedBox: {
    textAlign: 'center', padding: '16px 0',
  },
  lockedIcon: { fontSize: '2rem', marginBottom: 8 },
  lockedText: { fontSize: '0.82rem', color: '#b44aff', fontWeight: 600 },
  lockedTime: { fontSize: '1.2rem', fontWeight: 700, color: '#b44aff', marginTop: 6 },
  ghostBar: {
    height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)',
    overflow: 'hidden', marginBottom: 10,
  },
  ghostFill: { height: '100%', borderRadius: 2, transition: 'width 0.5s' },
  meta: {
    display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12,
  },
  chip: {
    fontSize: '0.52rem', color: '#6b6b80', background: 'rgba(255,255,255,0.03)',
    padding: '3px 8px', borderRadius: 6,
  },
  reportChip: {
    fontSize: '0.52rem', color: 'rgba(255,51,102,0.5)', background: 'none',
    border: '1px solid rgba(255,51,102,0.12)', borderRadius: 6, padding: '3px 8px',
    fontFamily: 'inherit', marginLeft: 'auto', pointerEvents: 'auto',
  },
  closeBtn: {
    width: '100%', padding: '14px', borderRadius: 14,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#e8e8f0', fontSize: '0.82rem', fontWeight: 600,
    fontFamily: 'inherit', touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent', pointerEvents: 'auto',
  },
};
