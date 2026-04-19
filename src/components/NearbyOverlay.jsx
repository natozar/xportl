import { useState, useEffect } from 'react';
import { getRarity, getCapsuleType } from '../services/capsules';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';

/**
 * NearbyOverlay — minimal directional indicators.
 *
 * Only shows individual indicators for capsules within 30m.
 * Everything else is just a count in the badge.
 * Indicators are NOT tappable — the LockOnOverlay handles interaction.
 */

const INDICATOR_RADIUS = 30; // Only show arrows for capsules within this range

export default function NearbyOverlay({ capsules, userLat, userLng }) {
  const [heading, setHeading] = useState(0);
  const { getPitch } = useDeviceOrientation();

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

  const allNearby = (capsules || []).filter((c) =>
    c.content?.type !== 'ping' && c.distance_meters !== undefined && c.distance_meters <= 500
  );

  // Only show individual indicators for close capsules
  const closeEnough = allNearby.filter((c) => c.distance_meters <= INDICATOR_RADIUS);
  const farCount = allNearby.length - closeEnough.length;

  if (allNearby.length === 0) return null;

  return (
    <div style={s.container}>
      {/* Individual direction indicators (≤30m only) */}
      {closeEnough.map((cap) => {
        const bearing = (userLat && userLng)
          ? getBearing(userLat, userLng, cap.lat, cap.lng) : 0;

        let relAngle = bearing - heading;
        while (relAngle > 180) relAngle -= 360;
        while (relAngle < -180) relAngle += 360;

        const dist = cap.distance_meters || 0;
        const rarity = getRarity(cap);
        const color = rarity.key !== 'common' ? rarity.color : '#00f0ff';
        const distLabel = dist < 1 ? '<1m' : `${dist.toFixed(0)}m`;

        // Position on screen edge
        const absAngle = Math.abs(relAngle);
        let posStyle;
        if (absAngle <= 60) {
          const x = 50 + (relAngle / 60) * 42;
          posStyle = { top: 6, left: `${x}%`, transform: 'translateX(-50%)' };
        } else if (absAngle <= 120) {
          const side = relAngle > 0 ? 'right' : 'left';
          const y = 15 + ((absAngle - 60) / 60) * 40;
          posStyle = { top: `${y}%`, [side]: 6, transform: 'translateY(-50%)' };
        } else {
          const x = 50 - ((relAngle > 0 ? 180 - relAngle : -180 - relAngle) / 60) * 42;
          posStyle = { bottom: 80, left: `${Math.max(8, Math.min(92, x))}%`, transform: 'translateX(-50%)' };
        }

        return (
          <div key={cap.id} style={{ ...s.indicator, ...posStyle }}>
            <div style={{ ...s.dot, background: color, boxShadow: `0 0 8px ${color}60` }} />
            <span style={{ ...s.dist, color }}>{distLabel}</span>
          </div>
        );
      })}

      {/* Count badge */}
      <div style={s.badge}>
        <div style={s.badgeDot} />
        <span style={s.badgeNum}>{allNearby.length}</span>
        <span style={s.badgeText}>
          {allNearby.length === 1 ? 'portal' : 'portais'}
          {farCount > 0 && ` · ${farCount} longe`}
        </span>
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
    position: 'fixed', inset: 0, zIndex: 9999,
    pointerEvents: 'none', overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    pointerEvents: 'none',
  },
  dot: {
    width: 8, height: 8, borderRadius: '50%',
  },
  dist: {
    fontSize: '0.45rem', fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  badge: {
    position: 'absolute',
    top: 'calc(10px + env(safe-area-inset-top, 0px))',
    left: '50%', transform: 'translateX(-50%)',
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
