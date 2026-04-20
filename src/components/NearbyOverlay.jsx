import { useMemo } from 'react';
import { isCapsuleLocked } from '../services/capsules';

/**
 * NearbyOverlay — passive ambient indicator only.
 *
 * Shows a single count badge at the top. The badge pulses in a denser
 * color when the user is in a cluster (3+ capsules within 50m),
 * signaling "there's something interesting here" without demanding action.
 *
 * No directional arrows. No per-capsule markers. Hunt mode is what guides —
 * this is just ambient awareness.
 */
export default function NearbyOverlay({ capsules }) {
  const { total, dense } = useMemo(() => {
    const real = (capsules || []).filter(
      (c) => c.content?.type !== 'ping' &&
             c.distance_meters !== undefined && c.distance_meters <= 500 &&
             !isCapsuleLocked(c)
    );
    const close = real.filter((c) => c.distance_meters <= 50);
    return { total: real.length, dense: close.length >= 3 };
  }, [capsules]);

  if (total === 0) return null;

  const accent = dense ? '#ff9a3c' : '#00f0ff';
  const glow = dense ? 'rgba(255,154,60,0.55)' : 'rgba(0,240,255,0.6)';

  return (
    <div
      style={{
        ...s.badge,
        borderColor: dense ? 'rgba(255,154,60,0.2)' : 'rgba(0,240,255,0.1)',
        animation: dense ? 'nearbyPulseDense 1.6s ease-in-out infinite' : 'none',
      }}
    >
      <div style={{ ...s.dot, background: accent, boxShadow: `0 0 10px ${glow}` }} />
      <span style={{ ...s.num, color: accent }}>{total}</span>
      <span style={s.text}>
        {dense ? 'zona quente' : total === 1 ? 'portal' : 'portais'}
      </span>
    </div>
  );
}

const s = {
  badge: {
    position: 'fixed',
    top: 'calc(10px + env(safe-area-inset-top, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 16px', borderRadius: 50,
    background: 'rgba(5,3,15,0.75)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(0,240,255,0.08)',
    pointerEvents: 'none', zIndex: 9998,
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%',
  },
  num: { fontSize: '0.85rem', fontWeight: 700 },
  text: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.04em',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('xportl-nearby-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-nearby-kf';
  style.textContent = `
    @keyframes nearbyPulseDense {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255,154,60,0.35); }
      50% { box-shadow: 0 0 0 8px rgba(255,154,60,0); }
    }
  `;
  document.head.appendChild(style);
}
