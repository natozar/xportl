import { useEffect, useRef, useState } from 'react';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { findArVideo, captureFrameAsWebp } from '../utils/cameraCapture';

/**
 * Fullscreen placement overlay — user aims phone at desired spot,
 * sees real-time heading + pitch, taps to anchor the capsule there.
 * Sits on top of the AR.js camera feed (no separate getUserMedia).
 */
export default function PlacementMode({ onConfirm, onCancel }) {
  const { getHeading, getPitch } = useDeviceOrientation();
  const hudRef = useRef(null);
  const rafRef = useRef(null);
  const [capturing, setCapturing] = useState(false);

  // Update HUD at ~15fps without React re-renders
  useEffect(() => {
    let lastFrame = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      if (now - lastFrame < 66) return; // ~15fps
      lastFrame = now;

      const h = getHeading();
      const p = getPitch();
      if (hudRef.current) {
        const hStr = h !== null ? `${h.toFixed(0)}°` : '--';
        const pStr = p !== null ? `${p >= 0 ? '+' : ''}${p.toFixed(0)}°` : '--';
        hudRef.current.textContent = `${hStr}  ↕ ${pStr}`;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [getHeading, getPitch]);

  const handleAnchor = async () => {
    setCapturing(true);

    const headingDeg = getHeading();
    const pitchDeg = getPitch();

    // Capture snapshot from AR.js video feed
    const arVideo = findArVideo();
    let hintPhotoBlob = null;
    if (arVideo) {
      const result = await captureFrameAsWebp(arVideo, 1280, 0.8);
      if (result) hintPhotoBlob = result.blob;
    }

    if (navigator.vibrate) navigator.vibrate([40, 20, 40]);

    onConfirm({
      headingDeg: headingDeg !== null ? Math.round(headingDeg * 10) / 10 : null,
      pitchDeg: pitchDeg !== null ? Math.round(pitchDeg * 10) / 10 : null,
      hintPhotoBlob,
    });
  };

  return (
    <div style={st.overlay}>
      {/* Crosshair */}
      <div style={st.crosshairWrap}>
        <svg width="80" height="80" viewBox="0 0 80 80" style={st.crosshair}>
          {/* Outer ring */}
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(0,240,255,0.25)" strokeWidth="1" />
          {/* Inner ring */}
          <circle cx="40" cy="40" r="16" fill="none" stroke="rgba(0,240,255,0.4)" strokeWidth="1" strokeDasharray="4 4" />
          {/* Crosshair lines */}
          <line x1="40" y1="4" x2="40" y2="20" stroke="rgba(0,240,255,0.5)" strokeWidth="1.5" />
          <line x1="40" y1="60" x2="40" y2="76" stroke="rgba(0,240,255,0.5)" strokeWidth="1.5" />
          <line x1="4" y1="40" x2="20" y2="40" stroke="rgba(0,240,255,0.5)" strokeWidth="1.5" />
          <line x1="60" y1="40" x2="76" y2="40" stroke="rgba(0,240,255,0.5)" strokeWidth="1.5" />
          {/* Center dot */}
          <circle cx="40" cy="40" r="3" fill="#00f0ff" opacity="0.8" />
        </svg>
      </div>

      {/* HUD — heading + pitch */}
      <div style={st.hudTop}>
        <span style={st.hudLabel}>MIRE NO LOCAL</span>
        <span ref={hudRef} style={st.hudValues}>--</span>
      </div>

      {/* Instructions */}
      <div style={st.instructions}>
        Aponte o celular para onde deseja esconder o portal
      </div>

      {/* Bottom bar */}
      <div style={st.bottomBar}>
        <button style={st.cancelBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button
          style={{ ...st.anchorBtn, ...(capturing ? { opacity: 0.5 } : {}) }}
          onClick={handleAnchor}
          disabled={capturing}
        >
          {capturing ? (
            <div style={st.miniSpin} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="3" />
            </svg>
          )}
          <span>{capturing ? 'Ancorando...' : 'Ancorar aqui'}</span>
        </button>
      </div>

      {/* Scan line animation */}
      <div style={st.scanLine} />
    </div>
  );
}

const st = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 10001,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  },
  crosshairWrap: {
    position: 'absolute', top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
  },
  crosshair: {
    filter: 'drop-shadow(0 0 8px rgba(0,240,255,0.3))',
  },
  hudTop: {
    position: 'absolute',
    top: 'calc(16px + env(safe-area-inset-top, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '10px 20px', borderRadius: 14,
    background: 'rgba(5,3,15,0.8)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(0,240,255,0.12)',
    pointerEvents: 'none',
  },
  hudLabel: {
    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'rgba(0,240,255,0.5)',
  },
  hudValues: {
    fontSize: '1.1rem', fontWeight: 700, color: '#00f0ff',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    letterSpacing: '0.05em',
    textShadow: '0 0 12px rgba(0,240,255,0.3)',
  },
  instructions: {
    position: 'absolute', top: 'calc(50% + 60px)',
    fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)',
    textAlign: 'center', maxWidth: 260, lineHeight: 1.5,
    pointerEvents: 'none',
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '16px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
    background: 'linear-gradient(to top, rgba(5,3,15,0.9) 60%, transparent)',
    display: 'flex', gap: 12, alignItems: 'center',
    pointerEvents: 'auto',
  },
  cancelBtn: {
    padding: '14px 20px', borderRadius: 14,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: 600,
    fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  anchorBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '14px 20px', borderRadius: 14,
    background: 'linear-gradient(135deg, rgba(0,240,255,0.15), rgba(0,240,255,0.08))',
    border: '1px solid rgba(0,240,255,0.3)',
    color: '#00f0ff', fontSize: '0.85rem', fontWeight: 700,
    fontFamily: 'inherit',
    boxShadow: '0 4px 20px rgba(0,240,255,0.15)',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  miniSpin: {
    width: 18, height: 18, border: '2px solid rgba(0,240,255,0.15)',
    borderTopColor: '#00f0ff', borderRadius: '50%',
    animation: 'spin 0.6s linear infinite',
  },
  scanLine: {
    position: 'absolute', left: 0, right: 0,
    height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,240,255,0.2), transparent)',
    animation: 'scanDown 3s linear infinite',
    pointerEvents: 'none',
  },
};

// Inject scan animation
if (typeof document !== 'undefined' && !document.getElementById('xportl-scan-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-scan-kf';
  style.textContent = `@keyframes scanDown { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`;
  document.head.appendChild(style);
}
