import React, { useState, useEffect, useRef } from 'react';
import { isCapsuleLocked } from '../services/capsules';

/**
 * NearbyOverlay — always-visible directional markers for nearby capsules.
 *
 * Unlike AR.js (which depends on GPS precision), this uses the device
 * compass + GPS bearing to show WHERE capsules are relative to the user
 * as floating labels on the camera feed. Works even with ±20m GPS error.
 */
export default function NearbyOverlay({ capsules, userLat, userLng, onSelect }) {
  const [heading, setHeading] = useState(0); // device compass heading in degrees
  const headingRef = useRef(0);

  // Listen to device compass
  useEffect(() => {
    const handler = (e) => {
      const h = e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
      if (h !== null) {
        headingRef.current = h;
        setHeading(h);
      }
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  if (!userLat || !userLng || capsules.length === 0) return null;

  // Filter to non-ping capsules within range
  const nearby = capsules.filter((c) => c.content?.type !== 'ping' && c.distance_meters <= 50);
  if (nearby.length === 0) return null;

  return (
    <div style={s.container}>
      {nearby.map((cap) => {
        // Calculate bearing from user to capsule
        const bearing = getBearing(userLat, userLng, cap.lat, cap.lng);

        // Relative angle: where is this capsule relative to where the phone is pointing?
        let relAngle = bearing - heading;
        while (relAngle > 180) relAngle -= 360;
        while (relAngle < -180) relAngle += 360;

        // Only show markers that are roughly in front of the camera (±90°)
        if (Math.abs(relAngle) > 90) return null;

        // Map angle to screen X position (center = 0°, edges = ±90°)
        const screenX = 50 + (relAngle / 90) * 45; // 5% to 95% of screen width

        // Map distance to size/opacity (closer = bigger, brighter)
        const dist = cap.distance_meters || 50;
        const scale = Math.max(0.6, Math.min(1.4, 1 + (1 - dist / 50) * 0.4));
        const opacity = Math.max(0.5, 1 - dist / 60);

        const locked = isCapsuleLocked(cap);
        const color = locked ? '#b44aff' : '#00f0ff';

        return (
          <button
            key={cap.id}
            style={{
              ...s.marker,
              left: `${screenX}%`,
              transform: `translateX(-50%) scale(${scale})`,
              opacity,
              borderColor: color,
            }}
            onClick={() => onSelect(cap)}
          >
            <div style={{ ...s.markerDot, background: color, boxShadow: `0 0 10px ${color}` }} />
            <div style={s.markerInfo}>
              <span style={{ ...s.markerLabel, color }}>
                {locked ? 'TRANCADO' : cap.content?.body?.slice(0, 15) || 'Portal'}
              </span>
              <span style={s.markerDist}>{dist < 1 ? '<1m' : `${dist.toFixed(0)}m`}</span>
            </div>
            {/* Direction arrow */}
            <div style={{ ...s.arrow, borderTopColor: color }} />
          </button>
        );
      })}

      {/* Capsule count badge */}
      <div style={s.countBadge}>
        <span style={s.countNum}>{nearby.length}</span>
        <span style={s.countLabel}>{nearby.length === 1 ? 'portal proximo' : 'portais proximos'}</span>
      </div>
    </div>
  );
}

// Calculate bearing between two GPS points in degrees (0-360)
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
    top: 'calc(50px + env(safe-area-inset-top, 0px))',
    left: 0, right: 0,
    height: '40%',
    zIndex: 10000,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    top: '30%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    background: 'none', border: 'none',
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    transition: 'left 0.3s ease, opacity 0.3s ease',
  },
  markerDot: {
    width: 14, height: 14, borderRadius: '50%',
    animation: 'pulse-ring 2s ease-out infinite',
  },
  markerInfo: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
    padding: '4px 10px', borderRadius: 10,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  markerLabel: {
    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.06em',
    maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  markerDist: {
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)',
    fontFamily: 'ui-monospace, monospace',
  },
  arrow: {
    width: 0, height: 0,
    borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
    borderTop: '6px solid',
    opacity: 0.6,
  },
  countBadge: {
    position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 14px', borderRadius: 50,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(0,240,255,0.1)',
    pointerEvents: 'none',
  },
  countNum: {
    fontSize: '0.8rem', fontWeight: 700, color: '#00f0ff',
  },
  countLabel: {
    fontSize: '0.52rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em',
  },
};
