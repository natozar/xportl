import React, { useState, useEffect } from 'react';

/**
 * PortalAnimation — Multidimensional portal opening sequence.
 *
 * Stages:
 * 0.0s — Void. Single particle of light.
 * 0.4s — Light expands. Ring forms.
 * 0.8s — Ring spins. Energy tendrils radiate outward.
 * 1.2s — Portal TEARS open from center (circle clip expands).
 * 1.8s — Reality visible through portal. Edges glow.
 * 2.4s — Portal fully open. Fade out overlay.
 * 2.8s — Gone. AR view revealed.
 */
export default function PortalAnimation({ onComplete }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),   // particles appear
      setTimeout(() => setPhase(2), 500),   // ring forms
      setTimeout(() => setPhase(3), 1000),  // tendrils
      setTimeout(() => setPhase(4), 1500),  // portal tears open
      setTimeout(() => setPhase(5), 2200),  // fully open
      setTimeout(() => { setPhase(6); onComplete(); }, 2800), // done
    ];

    // Haptic: dimensional tear
    if (navigator.vibrate) {
      setTimeout(() => navigator.vibrate([20, 30, 20]), 400);
      setTimeout(() => navigator.vibrate([40, 20, 40, 20, 60]), 1000);
      setTimeout(() => navigator.vibrate([80, 30, 80]), 1500);
    }

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  if (phase >= 6) return null;

  return (
    <div style={{
      ...s.container,
      opacity: phase >= 5 ? 0 : 1,
      transition: 'opacity 0.6s ease',
    }}>
      {/* Background void */}
      <div style={s.void} />

      {/* Particle field */}
      <div style={{ ...s.particles, opacity: phase >= 1 ? 1 : 0 }}>
        {Array.from({ length: 40 }, (_, i) => {
          const angle = (i / 40) * 360;
          const delay = (i * 0.05);
          const dist = phase >= 3 ? 45 : 5;
          return (
            <div key={i} style={{
              ...s.particle,
              transform: `rotate(${angle}deg) translateY(-${dist}vh)`,
              opacity: phase >= 2 ? (1 - i * 0.02) : 0.3,
              transition: `transform ${0.8 + delay * 0.3}s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s`,
              transitionDelay: `${delay}s`,
              background: i % 3 === 0 ? '#00f0ff' : i % 3 === 1 ? '#b44aff' : '#ff6b2b',
              width: i % 5 === 0 ? 3 : 2,
              height: i % 5 === 0 ? 3 : 2,
            }} />
          );
        })}
      </div>

      {/* Outer ring */}
      <svg style={{ ...s.svg, opacity: phase >= 2 ? 1 : 0 }} viewBox="0 0 400 400">
        {/* Ring 1 — outer, slow */}
        <circle cx="200" cy="200" r={phase >= 3 ? 160 : 40}
          fill="none" stroke="url(#grad1)" strokeWidth="1.5"
          style={{ transition: 'r 1s cubic-bezier(0.16, 1, 0.3, 1)', opacity: 0.6 }}
        />
        {/* Ring 2 — middle, medium */}
        <circle cx="200" cy="200" r={phase >= 3 ? 120 : 30}
          fill="none" stroke="url(#grad2)" strokeWidth="1"
          style={{ transition: 'r 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s', opacity: 0.4 }}
          strokeDasharray="8 4"
        />
        {/* Ring 3 — inner, fast */}
        <circle cx="200" cy="200" r={phase >= 3 ? 80 : 20}
          fill="none" stroke="#00f0ff" strokeWidth="2"
          style={{ transition: 'r 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s', opacity: 0.8 }}
        />
        {/* Energy cross lines */}
        {phase >= 3 && [0, 45, 90, 135].map((angle) => (
          <line key={angle} x1="200" y1="200"
            x2={200 + Math.cos(angle * Math.PI / 180) * 180}
            y2={200 + Math.sin(angle * Math.PI / 180) * 180}
            stroke={`rgba(0,240,255,${phase >= 4 ? 0 : 0.15})`}
            strokeWidth="0.5"
            style={{ transition: 'stroke 0.5s' }}
          />
        ))}
        {/* Gradients */}
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f0ff" />
            <stop offset="50%" stopColor="#b44aff" />
            <stop offset="100%" stopColor="#ff6b2b" />
          </linearGradient>
          <linearGradient id="grad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b44aff" />
            <stop offset="100%" stopColor="#00f0ff" />
          </linearGradient>
        </defs>
      </svg>

      {/* Spinning glow core */}
      <div style={{
        ...s.core,
        transform: `scale(${phase >= 2 ? 1 : 0}) rotate(${phase * 90}deg)`,
        opacity: phase >= 4 ? 0 : 1,
        transition: 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s',
      }}>
        <div style={s.coreInner} />
      </div>

      {/* Portal tear (expanding circle mask) */}
      <div style={{
        ...s.tear,
        transform: `scale(${phase >= 4 ? (phase >= 5 ? 3 : 1.5) : 0})`,
        opacity: phase >= 4 ? 1 : 0,
        transition: phase >= 5
          ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s'
          : 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s',
      }}>
        <div style={s.tearInner} />
        <div style={s.tearRing} />
      </div>

      {/* Flash on tear */}
      <div style={{
        ...s.flash,
        opacity: phase === 4 ? 0.4 : 0,
        transition: 'opacity 0.15s',
      }} />

      {/* Brand text */}
      <div style={{
        ...s.brand,
        opacity: phase >= 1 && phase < 5 ? 1 : 0,
        transform: `translateY(${phase >= 2 ? 0 : 10}px)`,
        transition: 'opacity 0.5s, transform 0.5s',
      }}>
        <span style={s.brandX}>X</span>
        <span style={s.brandText}>PORTL</span>
      </div>
    </div>
  );
}

const s = {
  container: {
    position: 'fixed', inset: 0, zIndex: 99999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', pointerEvents: 'none',
  },
  void: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle at 50% 50%, #0d0a1a 0%, #050310 60%, #000 100%)',
  },
  particles: {
    position: 'absolute', width: 4, height: 4,
    top: '50%', left: '50%', transition: 'opacity 0.5s',
  },
  particle: {
    position: 'absolute', borderRadius: '50%',
    top: -1, left: -1,
    boxShadow: '0 0 6px currentColor',
  },
  svg: {
    position: 'absolute', width: '90vmin', height: '90vmin',
    transition: 'opacity 0.5s',
    animation: 'spin 8s linear infinite',
  },
  core: {
    position: 'absolute', width: 60, height: 60,
    borderRadius: '50%',
  },
  coreInner: {
    width: '100%', height: '100%', borderRadius: '50%',
    background: 'radial-gradient(circle, #fff 0%, #00f0ff 40%, transparent 70%)',
    boxShadow: '0 0 40px #00f0ff, 0 0 80px rgba(0,240,255,0.3), 0 0 120px rgba(180,74,255,0.15)',
  },
  tear: {
    position: 'absolute',
    width: '70vmin', height: '70vmin',
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  tearInner: {
    width: '100%', height: '100%', borderRadius: '50%',
    background: 'radial-gradient(circle, transparent 40%, rgba(0,240,255,0.05) 60%, rgba(180,74,255,0.08) 80%, transparent 100%)',
    border: '2px solid rgba(0,240,255,0.2)',
    boxShadow: '0 0 60px rgba(0,240,255,0.15), inset 0 0 60px rgba(0,240,255,0.05)',
  },
  tearRing: {
    position: 'absolute', inset: -4, borderRadius: '50%',
    border: '1px solid rgba(180,74,255,0.3)',
    animation: 'spin 3s linear infinite reverse',
  },
  flash: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle, rgba(0,240,255,0.6), transparent 60%)',
    pointerEvents: 'none',
    transition: 'opacity 0.15s',
  },
  brand: {
    position: 'absolute', bottom: '18%',
    display: 'flex', alignItems: 'baseline', gap: 2,
  },
  brandX: {
    fontSize: '2rem', fontWeight: 700, color: '#00f0ff',
    textShadow: '0 0 20px rgba(0,240,255,0.5)',
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
  brandText: {
    fontSize: '1.2rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)',
    letterSpacing: '0.35em',
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
};
