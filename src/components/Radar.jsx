import React from 'react';

export default function Radar({ lat, lng, altitude, nearbyCount = 0 }) {
  return (
    <div style={s.container}>
      {/* Radar circle */}
      <div style={s.radar}>
        <div style={s.ring1} />
        <div style={s.ring2} />
        <div style={s.sweep} />
        <div style={s.dot} />

        {nearbyCount > 0 && <div style={{ ...s.blip, top: '22%', left: '62%' }} />}
        {nearbyCount > 1 && <div style={{ ...s.blip, top: '58%', left: '28%' }} />}
        {nearbyCount > 2 && <div style={{ ...s.blip, top: '38%', left: '72%' }} />}
      </div>

      {/* Count */}
      {nearbyCount > 0 ? (
        <div style={s.info}>
          <span style={s.count}>{nearbyCount}</span>
          <span style={s.label}>{nearbyCount === 1 ? 'sinal' : 'sinais'}</span>
        </div>
      ) : (
        <span style={s.empty}>--</span>
      )}

      {/* Coords */}
      {lat !== null && (
        <div style={s.coords}>
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
      )}
    </div>
  );
}

const s = {
  container: {
    position: 'fixed',
    bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
    left: 14,
    zIndex: 32,
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    background: 'rgba(10, 10, 15, 0.55)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    minWidth: 80,
  },
  radar: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    position: 'relative',
    overflow: 'hidden',
    background: 'rgba(0, 255, 136, 0.02)',
    border: '1px solid rgba(0, 255, 136, 0.08)',
  },
  ring1: {
    position: 'absolute',
    inset: '20%',
    borderRadius: '50%',
    border: '1px solid rgba(0, 255, 136, 0.08)',
  },
  ring2: {
    position: 'absolute',
    inset: '40%',
    borderRadius: '50%',
    border: '1px solid rgba(0, 255, 136, 0.06)',
  },
  sweep: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '50%',
    height: 1,
    background: 'linear-gradient(90deg, rgba(0,255,136,0.5), transparent)',
    transformOrigin: 'left center',
    animation: 'spin 3s linear infinite',
  },
  dot: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 3,
    height: 3,
    borderRadius: '50%',
    background: '#00ff88',
    boxShadow: '0 0 6px rgba(0, 255, 136, 0.6)',
  },
  blip: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: '#00ff88',
    boxShadow: '0 0 6px rgba(0, 255, 136, 0.5)',
    animation: 'glitch-flicker 3s ease-in-out infinite',
  },
  info: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  count: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#00ff88',
    textShadow: '0 0 10px rgba(0, 255, 136, 0.3)',
  },
  label: {
    fontSize: '0.5rem',
    color: 'rgba(255,255,255,0.25)',
    letterSpacing: '0.05em',
  },
  empty: {
    fontSize: '0.7rem',
    color: 'rgba(255,255,255,0.15)',
    letterSpacing: '0.1em',
  },
  coords: {
    fontSize: '0.42rem',
    color: 'rgba(255,255,255,0.15)',
    letterSpacing: '0.04em',
    fontFamily: 'monospace',
  },
};
