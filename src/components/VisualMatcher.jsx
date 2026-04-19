import { useEffect, useRef, useState } from 'react';
import { findArVideo } from '../utils/cameraCapture';
import { compareFrameToRef } from '../utils/visualMatch';

/**
 * Visual matching overlay — compares live camera feed against
 * the hint_photo of a directional capsule. Shows a real-time
 * match meter. When match + heading align, capsule unlocks.
 *
 * Only renders when there's a nearby directional capsule with
 * a hint photo within range.
 */
export default function VisualMatcher({ capsule, onMatch }) {
  const [similarity, setSimilarity] = useState(0);
  const [matched, setMatched] = useState(false);
  const rafRef = useRef(null);
  const matchedRef = useRef(false);

  useEffect(() => {
    if (!capsule?.hint_photo_url || matched) return;

    let lastFrame = 0;
    const loop = async (now) => {
      rafRef.current = requestAnimationFrame(loop);
      // Compare at ~5fps (200ms intervals)
      if (now - lastFrame < 200) return;
      lastFrame = now;

      const video = findArVideo();
      if (!video || !video.videoWidth) return;

      const sim = await compareFrameToRef(video, capsule.hint_photo_url);
      setSimilarity(sim);

      // Match threshold: 0.65+ means high visual similarity
      if (sim >= 0.65 && !matchedRef.current) {
        matchedRef.current = true;
        setMatched(true);
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        onMatch?.();
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [capsule?.hint_photo_url, matched, onMatch]);

  // Reset when capsule changes
  useEffect(() => {
    setMatched(false);
    setSimilarity(0);
    matchedRef.current = false;
  }, [capsule?.id]);

  if (!capsule?.hint_photo_url) return null;

  // Visual feedback colors
  const level = matched ? 'match' : similarity > 0.5 ? 'hot' : similarity > 0.3 ? 'warm' : similarity > 0.15 ? 'cool' : 'cold';
  const colors = {
    cold: { bar: '#3b82f6', text: 'Procurando...', icon: '❄️' },
    cool: { bar: '#8b5cf6', text: 'Ficando perto', icon: '🟣' },
    warm: { bar: '#f59e0b', text: 'Quase la!', icon: '🟡' },
    hot:  { bar: '#ef4444', text: 'Muito perto!', icon: '🔥' },
    match:{ bar: '#00ff88', text: 'Portal encontrado!', icon: '✦' },
  };
  const c = colors[level];

  return (
    <div style={st.container}>
      {/* Match meter bar */}
      <div style={st.meterWrap}>
        <div style={st.meterBg}>
          <div style={{
            ...st.meterFill,
            width: `${Math.max(2, similarity * 100)}%`,
            background: c.bar,
            boxShadow: `0 0 12px ${c.bar}60`,
          }} />
        </div>
        <div style={st.meterInfo}>
          <span style={{ fontSize: '0.9rem' }}>{c.icon}</span>
          <span style={{ ...st.meterText, color: c.bar }}>{c.text}</span>
          <span style={st.meterPct}>{Math.round(similarity * 100)}%</span>
        </div>
      </div>

      {/* Hint photo thumbnail (thermal overlay) */}
      {!matched && (
        <div style={st.hintWrap}>
          <img
            src={capsule.hint_photo_url}
            alt=""
            style={{
              ...st.hintImg,
              opacity: 0.25 + similarity * 0.5,
              filter: `saturate(0) brightness(${0.3 + similarity * 0.4}) sepia(1) hue-rotate(${similarity > 0.4 ? '0' : '180'}deg)`,
            }}
          />
          <span style={st.hintLabel}>Referencia</span>
        </div>
      )}

      {/* Match flash */}
      {matched && (
        <div style={st.matchFlash}>
          <span style={st.matchIcon}>✦</span>
        </div>
      )}
    </div>
  );
}

const st = {
  container: {
    position: 'fixed',
    bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
    left: 10, right: 10,
    zIndex: 10001,
    pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  meterWrap: {
    width: '100%', maxWidth: 360,
    padding: '8px 14px', borderRadius: 16,
    background: 'rgba(5,3,15,0.85)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  meterBg: {
    height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
    overflow: 'hidden', marginBottom: 6,
  },
  meterFill: {
    height: '100%', borderRadius: 2, transition: 'width 0.3s ease, background 0.3s ease',
  },
  meterInfo: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  meterText: {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em',
    flex: 1,
  },
  meterPct: {
    fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)',
    fontFamily: 'ui-monospace, monospace',
  },
  hintWrap: {
    position: 'fixed', top: 'calc(70px + env(safe-area-inset-top, 0px))', right: 10,
    width: 80, borderRadius: 10, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.1)',
    pointerEvents: 'none',
  },
  hintImg: {
    width: '100%', height: 60, objectFit: 'cover', display: 'block',
    transition: 'opacity 0.3s, filter 0.3s',
  },
  hintLabel: {
    display: 'block', textAlign: 'center',
    fontSize: '0.4rem', color: 'rgba(255,255,255,0.3)',
    padding: '2px 0', background: 'rgba(5,3,15,0.8)',
    letterSpacing: '0.08em', fontWeight: 600,
  },
  matchFlash: {
    position: 'fixed', top: '40%', left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    animation: 'matchPulse 1s ease-out forwards',
  },
  matchIcon: {
    fontSize: '4rem', color: '#00ff88',
    textShadow: '0 0 40px rgba(0,255,136,0.6)',
  },
};

// Inject match animation
if (typeof document !== 'undefined' && !document.getElementById('xportl-match-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-match-kf';
  style.textContent = `@keyframes matchPulse { 0% { opacity: 0; transform: translate(-50%,-50%) scale(0.5); } 30% { opacity: 1; transform: translate(-50%,-50%) scale(1.2); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(2); } }`;
  document.head.appendChild(style);
}
