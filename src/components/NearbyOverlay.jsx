import { useState, useEffect, useRef } from 'react';
import { isCapsuleLocked, isGhostCapsule, getRarity, getCapsuleType } from '../services/capsules';

/**
 * NearbyOverlay — directional edge indicators only.
 *
 * Shows small arrow pointers around the screen edge pointing
 * toward each capsule's real-world bearing. Tapping an arrow
 * opens the capsule modal. Capsules are NEVER rendered as
 * floating orbs — that's ARScene's job via GPS coordinates.
 */
export default function NearbyOverlay({ capsules, userLat, userLng, onSelect }) {
  const [heading, setHeading] = useState(0);

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

  const nearby = (capsules || []).filter((c) =>
    c.content?.type !== 'ping' && (c.distance_meters === undefined || c.distance_meters <= 500)
  );

  if (nearby.length === 0) return null;

  return (
    <div style={s.container}>
      {nearby.map((cap) => {
        const bearing = (userLat && userLng)
          ? getBearing(userLat, userLng, cap.lat, cap.lng)
          : 0;

        let relAngle = bearing - heading;
        while (relAngle > 180) relAngle -= 360;
        while (relAngle < -180) relAngle += 360;

        const dist = cap.distance_meters || 0;
        const locked = isCapsuleLocked(cap);
        const rarity = getRarity(cap);
        const cType = getCapsuleType(cap);
        const useRarityColor = rarity.key !== 'common';
        const color = useRarityColor ? rarity.color : locked ? '#b44aff' : '#00f0ff';

        // Place indicator on screen edge based on relative angle.
        // ±60° = within camera FOV → top edge
        // ±60-120° = sides
        // >120° = bottom edge (behind you)
        const absAngle = Math.abs(relAngle);
        let posStyle;

        if (absAngle <= 60) {
          // Top edge — horizontal position maps angle to screen width
          const x = 50 + (relAngle / 60) * 45;
          posStyle = { top: 0, left: `${x}%`, transform: 'translateX(-50%)' };
        } else if (absAngle <= 120) {
          // Side edges
          const side = relAngle > 0 ? 'right' : 'left';
          const verticalT = (absAngle - 60) / 60; // 0 at 60°, 1 at 120°
          const y = 10 + verticalT * 50; // 10%-60% from top
          posStyle = { top: `${y}%`, [side]: 0, transform: 'translateY(-50%)' };
        } else {
          // Bottom edge — behind user
          const x = 50 - ((relAngle > 0 ? 180 - relAngle : -180 - relAngle) / 60) * 45;
          posStyle = { bottom: 0, left: `${Math.max(5, Math.min(95, x))}%`, transform: 'translateX(-50%)' };
        }

        const distLabel = dist < 1 ? 'aqui' : dist < 1000 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`;

        // Arrow rotation: point from edge toward center
        let arrowDeg = 0;
        if (absAngle <= 60) arrowDeg = 180; // top → points down
        else if (relAngle > 0 && absAngle <= 120) arrowDeg = 270; // right → points left
        else if (relAngle < 0 && absAngle <= 120) arrowDeg = 90; // left → points right
        else arrowDeg = 0; // bottom → points up

        return (
          <button
            key={cap.id}
            style={{ ...s.indicator, ...posStyle }}
            onClick={() => onSelect(cap)}
          >
            {/* Arrow */}
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill={color}
              style={{ transform: `rotate(${arrowDeg}deg)`, opacity: 0.7 }}
            >
              <path d="M12 4l-6 8h4v8h4v-8h4z" />
            </svg>
            {/* Info chip */}
            <div style={{ ...s.chip, borderColor: `${color}33` }}>
              {rarity.key !== 'common' && (
                <span style={{ color: rarity.color, fontSize: '0.55rem', fontWeight: 700 }}>{rarity.icon}</span>
              )}
              <span style={{ color, fontSize: '0.5rem', fontWeight: 600 }}>
                {locked ? '🔒' : cType.icon}
              </span>
              <span style={s.chipDist}>{distLabel}</span>
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
    position: 'fixed', inset: 0,
    zIndex: 10000,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: 'none', border: 'none', padding: 4,
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    zIndex: 1,
  },
  chip: {
    display: 'flex', alignItems: 'center', gap: 3,
    padding: '3px 8px', borderRadius: 8,
    background: 'rgba(5,3,15,0.8)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
  },
  chipDist: {
    fontSize: '0.45rem', color: 'rgba(255,255,255,0.35)',
    fontFamily: 'ui-monospace, monospace',
  },
  badge: {
    position: 'absolute', top: 'calc(10px + env(safe-area-inset-top, 0px))', left: '50%',
    transform: 'translateX(-50%)',
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
  badgeNum: { fontSize: '0.85rem', fontWeight: 700, color: '#00f0ff' },
  badgeText: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' },
};
