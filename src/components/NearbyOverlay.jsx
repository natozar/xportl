import { useState, useEffect, useRef } from 'react';
import { isCapsuleLocked, isGhostCapsule } from '../services/capsules';

export default function NearbyOverlay({ capsules, userLat, userLng, onSelect }) {
  const [heading, setHeading] = useState(0);
  const tickRef = useRef(0);
  const rafRef = useRef(null);
  const [, forceUpdate] = useState(0);

  // Compass
  useEffect(() => {
    const handler = (e) => {
      const h = e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
      if (h !== null) setHeading(h);
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  // Animation loop via rAF — only re-renders at ~10fps to keep it subtle
  useEffect(() => {
    let lastFrame = 0;
    const loop = (now) => {
      rafRef.current = requestAnimationFrame(loop);
      // Throttle to ~10fps (100ms between frames)
      if (now - lastFrame < 100) return;
      lastFrame = now;
      tickRef.current = now;
      forceUpdate((n) => n + 1);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const nearby = (capsules || []).filter((c) =>
    c.content?.type !== 'ping' && (c.distance_meters === undefined || c.distance_meters <= 500)
  );

  if (nearby.length === 0) return null;

  return (
    <div style={s.container}>
      {nearby.map((cap, idx) => {
        const bearing = (userLat && userLng) ? getBearing(userLat, userLng, cap.lat, cap.lng) : idx * 60;
        let relAngle = bearing - heading;
        while (relAngle > 180) relAngle -= 360;
        while (relAngle < -180) relAngle += 360;

        // Show markers in wider FOV (±120° so they're visible when turning)
        if (Math.abs(relAngle) > 120) return null;

        const screenX = 50 + (relAngle / 120) * 48;
        const dist = cap.distance_meters || 0;
        const locked = isCapsuleLocked(cap);
        const ghost = isGhostCapsule(cap);

        // Distribute vertically: closer capsules sit lower (more centered),
        // farther ones higher. Stagger by index to avoid overlap.
        const distBand = Math.min(dist / 500, 1); // 0=close, 1=far
        const verticalBase = 30 + distBand * 25; // 30%-55% from top
        const stagger = (idx % 5) * 8; // offset each by 8%
        const screenY = verticalBase + stagger;

        // Visual properties based on distance
        const closeness = Math.max(0, 1 - dist / 500);
        const size = 40 + closeness * 16; // 40-56px (smaller, cleaner)
        const baseColor = locked ? [180, 74, 255] : ghost ? [180, 74, 255] : [0, 240, 255];
        const color = `rgb(${baseColor.join(',')})`;
        const glow = `rgba(${baseColor.join(',')}, ${0.2 + closeness * 0.2})`;

        // Subtle animation (slow, steady — easy to tap)
        const t = tickRef.current;
        const phase = (t / 3000 + idx * 1.7) % (Math.PI * 2);
        const floatY = Math.sin(phase) * 1.5; // minimal float
        const ringRotation = (t / 200 + idx * 40) % 360; // slow spin
        const pulseScale = 1 + Math.sin(phase * 2) * 0.03; // barely breathing

        return (
          <button
            key={cap.id}
            style={{
              ...s.portal,
              left: `${screenX}%`,
              top: `${screenY}%`,
              transform: `translate(-50%, -50%) translateY(${floatY}px)`,
              width: size, height: size + 30,
            }}
            onClick={() => onSelect(cap)}
          >
            {/* Outer glow */}
            <div style={{
              ...s.outerGlow,
              width: size * 1.8, height: size * 1.8,
              background: `radial-gradient(circle, ${glow}, transparent 70%)`,
              transform: `scale(${pulseScale})`,
            }} />

            {/* Orbital ring */}
            <svg style={{ ...s.ring, width: size, height: size, transform: `rotate(${ringRotation}deg)` }} viewBox="0 0 100 100">
              <ellipse cx="50" cy="50" rx="46" ry="20"
                fill="none" stroke={color} strokeWidth="1.5"
                opacity={0.4 + closeness * 0.3}
                strokeDasharray="8 4"
              />
            </svg>

            {/* Second ring (cross axis) */}
            <svg style={{ ...s.ring, width: size, height: size, transform: `rotate(${-ringRotation * 0.7 + 90}deg)` }} viewBox="0 0 100 100">
              <ellipse cx="50" cy="50" rx="44" ry="18"
                fill="none" stroke={color} strokeWidth="1"
                opacity={0.2 + closeness * 0.2}
              />
            </svg>

            {/* Core orb */}
            <div style={{
              ...s.core,
              width: size * 0.35, height: size * 0.35,
              background: `radial-gradient(circle at 35% 35%, #fff, ${color} 60%, transparent)`,
              boxShadow: `0 0 ${10 + closeness * 20}px ${color}, 0 0 ${20 + closeness * 40}px ${glow}`,
              transform: `scale(${pulseScale})`,
            }} />

            {/* Inner shimmer */}
            <div style={{
              ...s.shimmer,
              width: size * 0.2, height: size * 0.2,
              opacity: 0.6 + Math.sin(phase * 5) * 0.4,
            }} />

            {/* Info label */}
            <div style={s.label}>
              <span style={{ ...s.labelType, color }}>
                {locked ? '🔒' : ghost ? '👻' : '✦'} {locked ? 'Trancado' : cap.content?.body?.slice(0, 12) || 'Portal'}
              </span>
              <span style={s.labelDist}>
                {dist < 1 ? 'aqui' : dist < 1000 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`}
              </span>
            </div>
          </button>
        );
      })}

      {/* Count badge */}
      <div style={s.badge}>
        <div style={s.badgeDot} />
        <span style={s.badgeNum}>{nearby.length}</span>
        <span style={s.badgeText}>{nearby.length === 1 ? 'portal' : 'portais'}</span>
      </div>
    </div>
  );
}

function getBearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const s = {
  container: {
    position: 'fixed',
    top: 'calc(10px + env(safe-area-inset-top, 0px))',
    left: 0, right: 0,
    height: '75%',
    zIndex: 10000,
    pointerEvents: 'none',
    overflow: 'visible',
  },
  portal: {
    position: 'absolute',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center',
    background: 'none', border: 'none',
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    transition: 'left 0.3s ease-out',
  },
  outerGlow: {
    position: 'absolute',
    borderRadius: '50%',
    transition: 'transform 0.3s ease',
    pointerEvents: 'none',
  },
  ring: {
    position: 'absolute',
    pointerEvents: 'none',
    transition: 'none',
  },
  core: {
    position: 'relative',
    borderRadius: '50%',
    zIndex: 2,
    transition: 'transform 0.3s ease',
  },
  shimmer: {
    position: 'absolute',
    borderRadius: '50%',
    background: '#fff',
    filter: 'blur(2px)',
    zIndex: 3,
    pointerEvents: 'none',
  },
  label: {
    position: 'absolute',
    bottom: -4,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    padding: '5px 12px', borderRadius: 12,
    background: 'rgba(5,3,15,0.8)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.06)',
    zIndex: 4, pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  labelType: {
    fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.03em',
  },
  labelDist: {
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)',
    fontFamily: 'ui-monospace, monospace',
  },
  badge: {
    position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 16px', borderRadius: 50,
    background: 'rgba(5,3,15,0.75)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(0,240,255,0.08)',
    pointerEvents: 'none', zIndex: 5,
  },
  badgeDot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#00f0ff', boxShadow: '0 0 8px rgba(0,240,255,0.6)',
  },
  badgeNum: {
    fontSize: '0.85rem', fontWeight: 700, color: '#00f0ff',
  },
  badgeText: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em',
  },
};
