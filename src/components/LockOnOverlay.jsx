import { useState, useEffect, useRef, useCallback } from 'react';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { getRarity, getCapsuleType } from '../services/capsules';

/**
 * LockOnOverlay — 2D targeting + multi-capsule carousel.
 *
 * Single capsule: auto lock-on via heading/pitch → "Abrir Portal"
 * Multiple capsules: bottom carousel to swipe/select, then lock-on
 * follows the selected capsule.
 */

const AIM_HEADING_TOLERANCE = 20;
const AIM_PITCH_TOLERANCE = 25;
const LOCK_DELAY = 400;
const LOCK_RADIUS = 3; // meters

export default function LockOnOverlay({ capsules, onSelect }) {
  const { getHeading, getPitch } = useDeviceOrientation();
  const [lockedCapsule, setLockedCapsule] = useState(null);
  const [lockProgress, setLockProgress] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const aimStartRef = useRef(null);
  const aimTargetRef = useRef(null);
  const rafRef = useRef(null);

  const candidates = (capsules || []).filter((c) =>
    c.distance_meters !== undefined && c.distance_meters <= LOCK_RADIUS && c.content?.type !== 'ping'
  ).sort((a, b) => a.distance_meters - b.distance_meters);

  const multiMode = candidates.length > 1;
  const selectedCap = multiMode ? candidates[selectedIdx] : null;

  // Reset selection when candidates change
  useEffect(() => {
    setSelectedIdx(0);
    setLockedCapsule(null);
    setLockProgress(0);
  }, [candidates.length]);

  // Lock-on loop
  useEffect(() => {
    if (candidates.length === 0) {
      setLockedCapsule(null);
      setLockProgress(0);
      return;
    }

    let lastFrame = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      if (now - lastFrame < 50) return;
      lastFrame = now;

      const h = getHeading();
      const p = getPitch();
      if (h === null) return;

      // In multi mode, only try to lock the selected capsule
      // In single mode, try the only candidate
      const target = multiMode ? candidates[selectedIdx] : candidates[0];
      if (!target) return;

      let isAimed = false;

      if (target.heading_deg !== null && target.heading_deg !== undefined) {
        let hDiff = h - target.heading_deg;
        hDiff = ((hDiff + 180) % 360 + 360) % 360 - 180;
        const pDiff = (p || 0) - (target.pitch_deg || 0);
        isAimed = Math.abs(hDiff) <= AIM_HEADING_TOLERANCE && Math.abs(pDiff) <= AIM_PITCH_TOLERANCE;
      } else {
        // Non-directional within 3m → always aimed
        isAimed = true;
      }

      if (isAimed) {
        if (aimTargetRef.current !== target.id) {
          aimTargetRef.current = target.id;
          aimStartRef.current = now;
          setLockProgress(0);
          setLockedCapsule(null);
        } else {
          const elapsed = now - aimStartRef.current;
          const progress = Math.min(1, elapsed / LOCK_DELAY);
          setLockProgress(progress);
          if (progress >= 1 && !lockedCapsule) {
            setLockedCapsule(target);
            // Celebratory ascending haptic + quick chime via WebAudio
            if (navigator.vibrate) navigator.vibrate([20, 30, 50, 30, 80]);
            try {
              const ctx = new (window.AudioContext || window.webkitAudioContext)();
              [659.25, 880].forEach((f, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = f;
                const t0 = ctx.currentTime + i * 0.06;
                gain.gain.setValueAtTime(0, t0);
                gain.gain.linearRampToValueAtTime(0.1, t0 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t0); osc.stop(t0 + 0.45);
              });
              setTimeout(() => { try { ctx.close(); } catch { /* already closed */ } }, 600);
            } catch { /* Web Audio unavailable */ }
          }
        }
      } else {
        if (aimTargetRef.current) {
          aimTargetRef.current = null;
          aimStartRef.current = null;
          setLockProgress(0);
          setLockedCapsule(null);
        }
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [candidates, selectedIdx, getHeading, getPitch, lockedCapsule, multiMode]);

  const handleCarouselSelect = useCallback((idx) => {
    setSelectedIdx(idx);
    setLockedCapsule(null);
    setLockProgress(0);
    aimTargetRef.current = null;
    if (navigator.vibrate) navigator.vibrate(15);
  }, []);

  if (candidates.length === 0) return null;

  const activeCap = lockedCapsule || (multiMode ? selectedCap : candidates[0]);
  const rarity = activeCap ? getRarity(activeCap) : null;
  const cType = activeCap ? getCapsuleType(activeCap) : null;
  const color = rarity && rarity.key !== 'common' ? rarity.color : '#00f0ff';

  const showReticle = lockProgress > 0 || lockedCapsule;

  return (
    <div style={st.container}>
      {/* Celebration burst on lock (plays once via CSS) */}
      {lockedCapsule && (
        <>
          <div style={{ ...st.lockBurst, borderColor: color, boxShadow: `0 0 40px ${color}` }} />
          <div style={{ ...st.lockBurst2, borderColor: `${color}aa` }} />
          <div style={{ ...st.lockFlash, background: `radial-gradient(circle, ${color}44 0%, transparent 55%)` }} />
        </>
      )}

      {/* Lock-on reticle */}
      {showReticle && (
        <div style={{
          ...st.reticle,
          opacity: 0.3 + lockProgress * 0.7,
          transform: `scale(${1.3 - lockProgress * 0.3})`,
          borderColor: lockedCapsule ? color : 'rgba(0,240,255,0.3)',
          animation: lockedCapsule ? 'reticleLocked 0.6s ease-out' : 'none',
        }}>
          <div style={{ ...st.corner, top: -2, left: -2, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
          <div style={{ ...st.corner, top: -2, right: -2, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
          <div style={{ ...st.corner, bottom: -2, left: -2, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
          <div style={{ ...st.corner, bottom: -2, right: -2, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />

          {!lockedCapsule && (
            <svg style={st.progressRing} viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
              <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="2.5"
                strokeDasharray={`${lockProgress * 289} 289`} strokeLinecap="round"
                transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray 0.1s' }} />
            </svg>
          )}

          <div style={{
            ...st.centerDot,
            background: lockedCapsule ? color : 'rgba(255,255,255,0.3)',
            boxShadow: lockedCapsule ? `0 0 16px ${color}` : 'none',
          }} />
        </div>
      )}

      {/* Locked — open button */}
      {lockedCapsule && (
        <div style={st.lockedInfo}>
          <button
            style={{ ...st.openBtn, background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
            onClick={() => onSelect(lockedCapsule)}
          >
            <span style={st.openBtnText}>Abrir Portal</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Multi-capsule carousel ── */}
      {multiMode && !lockedCapsule && (
        <div style={st.carousel}>
          <div style={st.carouselScroll}>
            {candidates.map((cap, idx) => {
              const r = getRarity(cap);
              const ct = getCapsuleType(cap);
              const c = r.key !== 'common' ? r.color : '#00f0ff';
              const active = idx === selectedIdx;
              const dist = cap.distance_meters;
              const hasDir = cap.heading_deg !== null && cap.heading_deg !== undefined;

              return (
                <button
                  key={cap.id}
                  style={{
                    ...st.card,
                    ...(active ? { borderColor: `${c}55`, background: `${c}0a` } : {}),
                  }}
                  onClick={() => handleCarouselSelect(idx)}
                >
                  {/* Active indicator */}
                  {active && <div style={{ ...st.cardActive, background: c }} />}

                  {/* Icon row */}
                  <div style={st.cardTop}>
                    <span style={{ fontSize: '1rem' }}>
                      {r.key !== 'common' ? r.icon : ct.icon}
                    </span>
                    {hasDir && <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)' }}>📐</span>}
                  </div>

                  {/* Type */}
                  <span style={{ ...st.cardType, color: c }}>
                    {ct.key !== 'standard' ? ct.label : r.label}
                  </span>

                  {/* Distance */}
                  <span style={st.cardDist}>
                    {dist < 1 ? '<1m' : `${dist.toFixed(1)}m`}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hint */}
          <p style={st.carouselHint}>
            {candidates[selectedIdx]?.heading_deg !== null
              ? 'Mire na direcao para travar'
              : 'Travando automaticamente...'}
          </p>
        </div>
      )}

      {/* Single capsule hint (when not yet locked) */}
      {!multiMode && candidates.length === 1 && !lockedCapsule && lockProgress > 0 && (
        <div style={st.singleHint}>
          <span style={{ color, fontSize: '0.65rem', fontWeight: 600 }}>
            {rarity?.key !== 'common' ? `${rarity.icon} ` : ''}{cType?.icon} {cType?.label}
          </span>
          <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)' }}>
            {activeCap?.distance_meters < 1 ? '<1m' : `${activeCap?.distance_meters?.toFixed(1)}m`}
          </span>
        </div>
      )}
    </div>
  );
}

const st = {
  container: {
    position: 'fixed', inset: 0, zIndex: 10000,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none',
  },
  reticle: {
    width: 120, height: 120, position: 'relative',
    border: '1px solid rgba(0,240,255,0.2)', borderRadius: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.3s ease, opacity 0.2s, border-color 0.3s',
  },
  corner: { position: 'absolute', width: 16, height: 16 },
  progressRing: { position: 'absolute', width: 80, height: 80 },
  centerDot: { width: 6, height: 6, borderRadius: '50%', transition: 'all 0.3s' },
  lockedInfo: {
    marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    pointerEvents: 'auto',
  },
  openBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 32px', borderRadius: 16, border: 'none', color: '#0a0814',
    fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'auto',
  },
  openBtnText: { letterSpacing: '0.03em' },

  // Carousel
  carousel: {
    position: 'fixed',
    bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
    left: 0, right: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    pointerEvents: 'auto',
  },
  carouselScroll: {
    display: 'flex', gap: 8, padding: '0 16px',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none', msOverflowStyle: 'none',
    maxWidth: '100%',
  },
  card: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '10px 14px', borderRadius: 14, minWidth: 72, flexShrink: 0,
    background: 'rgba(5,3,15,0.85)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1.5px solid rgba(255,255,255,0.06)',
    fontFamily: 'inherit', position: 'relative',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    transition: 'all 0.2s',
  },
  cardActive: {
    position: 'absolute', top: 0, left: '20%', right: '20%',
    height: 2, borderRadius: '0 0 2px 2px',
  },
  cardTop: { display: 'flex', alignItems: 'center', gap: 4 },
  cardType: { fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.04em' },
  cardDist: {
    fontSize: '0.45rem', color: 'rgba(255,255,255,0.25)',
    fontFamily: 'ui-monospace, monospace',
  },
  carouselHint: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)',
    textAlign: 'center', margin: 0, pointerEvents: 'none',
  },
  singleHint: {
    position: 'fixed',
    bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 14px', borderRadius: 10,
    background: 'rgba(5,3,15,0.8)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.06)',
    pointerEvents: 'none',
  },
  lockBurst: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: '50%',
    border: '3px solid',
    animation: 'lockBurst 0.9s cubic-bezier(.1,.6,.3,1) forwards',
    pointerEvents: 'none',
  },
  lockBurst2: {
    position: 'absolute',
    width: 120, height: 120, borderRadius: '50%',
    border: '2px solid',
    animation: 'lockBurst2 1.2s cubic-bezier(.1,.6,.3,1) 0.1s forwards',
    pointerEvents: 'none',
  },
  lockFlash: {
    position: 'absolute',
    width: 400, height: 400,
    animation: 'lockFlash 0.5s ease-out',
    pointerEvents: 'none',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('xportl-lockon-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-lockon-kf';
  style.textContent = `
    @keyframes reticleLocked {
      0% { transform: scale(0.85); }
      40% { transform: scale(1.15); }
      100% { transform: scale(1); }
    }
    @keyframes lockBurst {
      0% { width: 40px; height: 40px; opacity: 0.9; border-width: 4px; }
      100% { width: 360px; height: 360px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes lockBurst2 {
      0% { width: 40px; height: 40px; opacity: 0.6; border-width: 3px; }
      100% { width: 500px; height: 500px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes lockFlash {
      0% { opacity: 0; transform: scale(0.6); }
      30% { opacity: 1; }
      100% { opacity: 0; transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);
}
