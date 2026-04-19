import { useState, useEffect, useRef } from 'react';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { getRarity, getCapsuleType } from '../services/capsules';

/**
 * LockOnOverlay — 2D targeting system for AR capsules.
 *
 * When the user aims within tolerance of a nearby capsule,
 * a lock-on reticle grows on screen with a large tappable
 * "Open" button. This replaces the unreliable A-Frame 3D
 * raycaster for mobile interaction.
 *
 * Only activates for capsules within AR_RENDER_RADIUS (3m).
 */

const AIM_HEADING_TOLERANCE = 20; // degrees
const AIM_PITCH_TOLERANCE = 25;
const LOCK_DELAY = 400; // ms of sustained aim before lock-on

export default function LockOnOverlay({ capsules, onSelect }) {
  const { getHeading, getPitch } = useDeviceOrientation();
  const [lockedCapsule, setLockedCapsule] = useState(null);
  const [lockProgress, setLockProgress] = useState(0); // 0-1
  const aimStartRef = useRef(null);
  const aimTargetRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    // Only consider capsules within 3m that have directional data OR are non-directional
    const candidates = (capsules || []).filter((c) =>
      c.distance_meters !== undefined && c.distance_meters <= 3 && c.content?.type !== 'ping'
    );

    if (candidates.length === 0) {
      setLockedCapsule(null);
      setLockProgress(0);
      return;
    }

    let lastFrame = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      if (now - lastFrame < 50) return; // 20fps
      lastFrame = now;

      const h = getHeading();
      const p = getPitch();
      if (h === null) return;

      // Find the best-aimed capsule
      let bestCap = null;
      let bestScore = Infinity;

      for (const cap of candidates) {
        if (cap.heading_deg !== null && cap.heading_deg !== undefined) {
          // Directional capsule — check heading + pitch
          let hDiff = h - cap.heading_deg;
          hDiff = ((hDiff + 180) % 360 + 360) % 360 - 180;
          const pDiff = (p || 0) - (cap.pitch_deg || 0);

          if (Math.abs(hDiff) <= AIM_HEADING_TOLERANCE && Math.abs(pDiff) <= AIM_PITCH_TOLERANCE) {
            const score = Math.sqrt(hDiff * hDiff + pDiff * pDiff);
            if (score < bestScore) { bestScore = score; bestCap = cap; }
          }
        } else {
          // Non-directional capsule within 3m — check bearing
          // These are always "in view" when within 3m, so auto-lock
          bestCap = bestCap || cap;
          if (!bestCap.heading_deg) bestScore = 0;
        }
      }

      if (bestCap) {
        if (aimTargetRef.current !== bestCap.id) {
          // New target — start lock timer
          aimTargetRef.current = bestCap.id;
          aimStartRef.current = now;
          setLockProgress(0);
          setLockedCapsule(null);
        } else {
          // Same target — update progress
          const elapsed = now - aimStartRef.current;
          const progress = Math.min(1, elapsed / LOCK_DELAY);
          setLockProgress(progress);

          if (progress >= 1 && !lockedCapsule) {
            setLockedCapsule(bestCap);
            if (navigator.vibrate) navigator.vibrate(30);
          }
        }
      } else {
        // No target aimed at
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
  }, [capsules, getHeading, getPitch, lockedCapsule]);

  // Nothing to show
  if (lockProgress === 0 && !lockedCapsule) return null;

  const cap = lockedCapsule;
  const rarity = cap ? getRarity(cap) : null;
  const cType = cap ? getCapsuleType(cap) : null;
  const color = rarity && rarity.key !== 'common' ? rarity.color : '#00f0ff';

  return (
    <div style={st.container}>
      {/* Lock-on reticle (always visible during aim) */}
      <div style={{
        ...st.reticle,
        opacity: 0.3 + lockProgress * 0.7,
        transform: `scale(${1.3 - lockProgress * 0.3})`,
        borderColor: lockedCapsule ? color : 'rgba(0,240,255,0.3)',
      }}>
        {/* Corner brackets */}
        <div style={{ ...st.corner, top: -2, left: -2, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
        <div style={{ ...st.corner, top: -2, right: -2, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
        <div style={{ ...st.corner, bottom: -2, left: -2, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
        <div style={{ ...st.corner, bottom: -2, right: -2, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />

        {/* Progress ring */}
        {!lockedCapsule && (
          <svg style={st.progressRing} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
            <circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeWidth="2.5"
              strokeDasharray={`${lockProgress * 289} 289`}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.1s' }}
            />
          </svg>
        )}

        {/* Center dot */}
        <div style={{
          ...st.centerDot,
          background: lockedCapsule ? color : 'rgba(255,255,255,0.3)',
          boxShadow: lockedCapsule ? `0 0 16px ${color}` : 'none',
        }} />
      </div>

      {/* Locked — show info + open button */}
      {lockedCapsule && (
        <div style={st.lockedInfo}>
          <div style={st.lockedHeader}>
            {rarity && rarity.key !== 'common' && (
              <span style={{ color: rarity.color, fontWeight: 700, fontSize: '0.7rem' }}>{rarity.icon} {rarity.label}</span>
            )}
            {cType && cType.key !== 'standard' && (
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>{cType.icon} {cType.label}</span>
            )}
            <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.25)' }}>
              {cap.distance_meters < 1 ? '<1m' : `${cap.distance_meters.toFixed(0)}m`}
            </span>
          </div>

          <button
            style={{ ...st.openBtn, background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
            onClick={() => onSelect(cap)}
          >
            <span style={st.openBtnText}>Abrir Portal</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
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
    width: 120, height: 120,
    position: 'relative',
    border: '1px solid rgba(0,240,255,0.2)',
    borderRadius: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.3s ease, opacity 0.2s, border-color 0.3s',
  },
  corner: {
    position: 'absolute', width: 16, height: 16,
  },
  progressRing: {
    position: 'absolute', width: 80, height: 80,
  },
  centerDot: {
    width: 6, height: 6, borderRadius: '50%',
    transition: 'all 0.3s',
  },
  lockedInfo: {
    marginTop: 20,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    pointerEvents: 'auto',
  },
  lockedHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 14px', borderRadius: 10,
    background: 'rgba(5,3,15,0.85)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  openBtn: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '14px 32px', borderRadius: 16,
    border: 'none', color: '#0a0814',
    fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'auto',
  },
  openBtnText: {
    letterSpacing: '0.03em',
  },
};
