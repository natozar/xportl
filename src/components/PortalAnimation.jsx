import { useState, useEffect, useRef } from 'react';

/**
 * PortalAnimation — Cinematic dimensional rift opening.
 *
 * Pure CSS/SVG, no WebGL dependency. Runs 3.5 seconds.
 * Three acts: Convergence → Rupture → Revelation.
 */
export default function PortalAnimation({ onComplete }) {
  const [t, setT] = useState(0); // time in ms
  const startRef = useRef(Date.now());

  useEffect(() => {
    let raf;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      setT(elapsed);
      if (elapsed < 3500) raf = requestAnimationFrame(tick);
      else onComplete();
    };
    raf = requestAnimationFrame(tick);

    // Haptics
    setTimeout(() => navigator.vibrate?.([15, 20, 15, 20, 15]), 300);
    setTimeout(() => navigator.vibrate?.([30, 15, 30, 15, 50, 15, 30]), 1200);
    setTimeout(() => navigator.vibrate?.([100, 40, 100]), 2000);

    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  const _p = t / 3500; // 0→1 normalized progress

  // Easing helpers
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeIn = (x) => x * x * x;

  // Phase calculations
  const convergence = Math.min(1, t / 1200);    // 0-1.2s
  const rupture = Math.max(0, Math.min(1, (t - 1200) / 800)); // 1.2-2.0s
  const revelation = Math.max(0, Math.min(1, (t - 2000) / 1000)); // 2.0-3.0s
  const fadeOut = Math.max(0, Math.min(1, (t - 2800) / 700)); // 2.8-3.5s

  // Derived values
  const ringScale = easeOut(convergence) * (1 + rupture * 2);
  const particleSpread = easeOut(convergence) * 35 + rupture * 50;
  const coreScale = convergence < 0.5 ? easeOut(convergence * 2) : (1 - easeIn(rupture));
  const tearScale = easeOut(rupture) * (1 + revelation);
  const glowIntensity = rupture > 0 ? (1 - revelation * 0.7) : convergence * 0.3;

  // 60 particles with different behaviors
  const particles = Array.from({ length: 60 }, (_, i) => {
    const angle = (i / 60) * Math.PI * 2;
    const layer = i % 3; // 0=inner fast, 1=mid, 2=outer slow
    const speed = [1.3, 1, 0.7][layer];
    const size = [2, 3, 1.5][layer];
    const colors = ['#00f0ff', '#b44aff', '#ff6b2b', '#00ff88', '#fff'];
    const color = colors[i % colors.length];
    const delay = (i / 60) * 0.3;
    const dist = particleSpread * speed;

    // During rupture, particles spiral outward
    const spiralAngle = angle + (rupture * Math.PI * 0.5);

    const x = Math.cos(spiralAngle) * dist;
    const y = Math.sin(spiralAngle) * dist;
    const opacity = convergence > 0.3 ? (1 - fadeOut) * (rupture > 0.5 ? (1 - (rupture - 0.5) * 2) : 1) : convergence;

    return { x, y, size, color, opacity: Math.max(0, opacity), delay };
  });

  // Ring data
  const rings = [
    { r: 30 + ringScale * 80, width: 2, color: '#00f0ff', opacity: 0.6, dasharray: 'none', speed: 1 },
    { r: 20 + ringScale * 60, width: 1.5, color: '#b44aff', opacity: 0.4, dasharray: '6 4', speed: -0.7 },
    { r: 40 + ringScale * 100, width: 1, color: '#ff6b2b', opacity: 0.2, dasharray: '3 6', speed: 0.5 },
    { r: 25 + ringScale * 70, width: 2.5, color: '#00f0ff', opacity: rupture > 0 ? 0.8 * (1 - rupture) : 0.3, dasharray: 'none', speed: 1.5 },
  ];

  if (fadeOut >= 1) return null;

  return (
    <div style={{ ...s.container, opacity: 1 - easeIn(fadeOut) }}>
      {/* Deep void background */}
      <div style={s.void}>
        <div style={{ ...s.nebula, opacity: convergence * 0.4 * (1 - fadeOut) }} />
      </div>

      {/* SVG layer: rings + energy lines */}
      <svg style={s.svg} viewBox="-200 -200 400 400">
        <defs>
          <radialGradient id="pg">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Ambient glow */}
        <circle r={tearScale * 120} fill="url(#pg)" opacity={glowIntensity} />

        {/* Rings */}
        {rings.map((ring, i) => (
          <circle key={i} r={ring.r} fill="none"
            stroke={ring.color} strokeWidth={ring.width}
            strokeDasharray={ring.dasharray}
            opacity={ring.opacity * (1 - fadeOut)}
            transform={`rotate(${t * ring.speed * 0.05})`}
            filter="url(#glow)"
          />
        ))}

        {/* Energy lines (during convergence) */}
        {convergence > 0.2 && rupture < 0.8 && Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + t * 0.001;
          const len = 50 + ringScale * 100;
          return (
            <line key={i}
              x1={0} y1={0}
              x2={Math.cos(a) * len} y2={Math.sin(a) * len}
              stroke="#00f0ff" strokeWidth="0.5"
              opacity={0.08 * (1 - rupture)}
            />
          );
        })}

        {/* Tear circle (portal opening) */}
        {rupture > 0 && (
          <circle r={tearScale * 80} fill="none"
            stroke="#00f0ff" strokeWidth={3 - revelation * 2}
            opacity={(1 - revelation * 0.5)}
            filter="url(#glow)"
          />
        )}
      </svg>

      {/* Particles */}
      <div style={s.particleContainer}>
        {particles.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
            transform: `translate(${p.x}vmin, ${p.y}vmin)`,
            opacity: p.opacity,
            transition: 'none',
          }} />
        ))}
      </div>

      {/* Core orb */}
      <div style={{
        ...s.core,
        transform: `scale(${coreScale})`,
        opacity: coreScale > 0.05 ? 1 : 0,
        boxShadow: `0 0 ${30 + glowIntensity * 60}px #00f0ff, 0 0 ${60 + glowIntensity * 100}px rgba(0,240,255,0.3), 0 0 ${100 + glowIntensity * 140}px rgba(180,74,255,0.15)`,
      }}>
        <div style={s.coreInner} />
      </div>

      {/* Flash on rupture */}
      <div style={{
        ...s.flash,
        opacity: rupture > 0 && rupture < 0.3 ? (0.3 - rupture) * 2 : 0,
      }} />

      {/* Dimensional rift edges (after tear) */}
      {revelation > 0 && (
        <div style={{
          ...s.rift,
          transform: `scale(${0.5 + revelation * 2})`,
          opacity: (1 - fadeOut) * 0.6,
        }}>
          <div style={s.riftEdge} />
        </div>
      )}

      {/* Brand */}
      <div style={{
        ...s.brand,
        opacity: convergence > 0.3 && fadeOut < 0.5 ? Math.min(1, (convergence - 0.3) * 3) * (1 - fadeOut * 2) : 0,
        transform: `translateY(${(1 - easeOut(convergence)) * 15}px) scale(${0.9 + easeOut(convergence) * 0.1})`,
      }}>
        <div style={s.brandGlow} />
        <span style={s.brandX}>X</span>
        <span style={s.brandName}>PORTL</span>
      </div>

      {/* Subtitle */}
      <div style={{
        ...s.tagline,
        opacity: convergence > 0.6 && rupture < 0.5 ? Math.min(1, (convergence - 0.6) * 4) * (1 - rupture * 2) : 0,
      }}>
        Deixe rastros. Encontre portais.
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
    background: '#020108',
  },
  nebula: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(ellipse at 40% 30%, rgba(180,74,255,0.08) 0%, transparent 50%), radial-gradient(ellipse at 60% 70%, rgba(0,240,255,0.06) 0%, transparent 50%)',
  },
  svg: {
    position: 'absolute', width: '100vmin', height: '100vmin',
  },
  particleContainer: {
    position: 'absolute', width: 0, height: 0,
  },
  core: {
    position: 'absolute', width: 24, height: 24,
    borderRadius: '50%', transition: 'none',
  },
  coreInner: {
    width: '100%', height: '100%', borderRadius: '50%',
    background: 'radial-gradient(circle, #fff 0%, #00f0ff 50%, transparent 100%)',
  },
  flash: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle, rgba(0,240,255,0.8) 0%, rgba(180,74,255,0.2) 30%, transparent 60%)',
  },
  rift: {
    position: 'absolute', width: '80vmin', height: '80vmin',
    borderRadius: '50%',
  },
  riftEdge: {
    width: '100%', height: '100%', borderRadius: '50%',
    border: '1px solid rgba(0,240,255,0.15)',
    boxShadow: 'inset 0 0 40px rgba(0,240,255,0.03), 0 0 30px rgba(0,240,255,0.05)',
    animation: 'spin 6s linear infinite reverse',
  },
  brand: {
    position: 'absolute', bottom: '20%',
    display: 'flex', alignItems: 'baseline', gap: 3,
    zIndex: 2,
  },
  brandGlow: {
    position: 'absolute', inset: '-20px -30px',
    background: 'radial-gradient(ellipse, rgba(0,240,255,0.08), transparent 70%)',
    borderRadius: '50%',
  },
  brandX: {
    fontSize: '2.8rem', fontWeight: 700, color: '#00f0ff',
    textShadow: '0 0 30px rgba(0,240,255,0.6), 0 0 60px rgba(0,240,255,0.2)',
    fontFamily: '-apple-system, system-ui, sans-serif',
    position: 'relative',
  },
  brandName: {
    fontSize: '1.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)',
    letterSpacing: '0.4em',
    fontFamily: '-apple-system, system-ui, sans-serif',
    position: 'relative',
  },
  tagline: {
    position: 'absolute', bottom: '14%',
    fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)',
    letterSpacing: '0.15em', fontWeight: 500,
    fontFamily: '-apple-system, system-ui, sans-serif',
  },
};
