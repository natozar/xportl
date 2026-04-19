import { useEffect, useRef, useState } from 'react';
import { getRarity, getCapsuleType } from '../services/capsules';

/**
 * CapsuleFoundAnimation — volumetric "found" reveal with real CSS 3D depth.
 *
 * Composition:
 *   - Root has perspective(1200px) so all children render with real depth.
 *   - Particles spread across translateZ(-120 .. +160) for genuine parallax.
 *   - Portal ring is a tilted disc (rotateX(55deg)) — reads as volumetric.
 *   - Gyroscope tilt adjusts rotateY(±8deg) for hand-motion parallax.
 *
 * This runs IN ADDITION to the 3D burst rendered inside ARScene via A-Frame
 * — the overlay is the HUD-side of the celebration; the A-Frame burst is the
 * world-side. Together they create the cinematic arrival moment.
 */

const PARTICLE_COUNT = 32;

export default function CapsuleFoundAnimation({ capsule, onClose, onOpen }) {
  const [stage, setStage] = useState(0);
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      angle: (i / PARTICLE_COUNT) * 360 + Math.random() * 12,
      dist: 80 + Math.random() * 220,
      depth: -140 + Math.random() * 320,  // translateZ depth
      delay: Math.random() * 140,
      size: 3 + Math.random() * 7,
      dur: 1000 + Math.random() * 500,
    }))
  );
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const audioCtxRef = useRef(null);

  const rarity = capsule ? getRarity(capsule) : null;
  const cType = capsule ? getCapsuleType(capsule) : null;
  const color = rarity && rarity.key !== 'common' ? rarity.color : '#00f0ff';
  const isRare = rarity && rarity.key !== 'common';

  // ── Gyroscope-based parallax ──
  useEffect(() => {
    if (!capsule) return;
    const handler = (e) => {
      // Smooth tilt into ±8° range
      const gamma = Math.max(-30, Math.min(30, e.gamma || 0));
      const beta = Math.max(-30, Math.min(30, (e.beta || 0) - 45));
      setTilt({ x: beta / 4, y: gamma / 3 });
    };
    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [capsule]);

  // ── Sound + haptic ──
  useEffect(() => {
    if (!capsule) return;

    if (navigator.vibrate) {
      navigator.vibrate(isRare ? [30, 40, 50, 30, 80, 40, 140] : [25, 40, 40, 30, 90]);
    }

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      const notes = isRare
        ? [440, 554.37, 659.25, 880]
        : [329.63, 415.3, 493.88];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + i * 0.08;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.9);
      });
      if (isRare) {
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.value = 55;
        const t0 = ctx.currentTime;
        subGain.gain.setValueAtTime(0, t0);
        subGain.gain.linearRampToValueAtTime(0.3, t0 + 0.03);
        subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
        sub.connect(subGain); subGain.connect(ctx.destination);
        sub.start(t0); sub.stop(t0 + 0.7);
      }
    } catch { /* Web Audio unavailable */ }

    const t1 = setTimeout(() => setStage(1), 120);
    const t2 = setTimeout(() => setStage(2), 300);
    const t3 = setTimeout(() => setStage(3), 1800);
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      try { audioCtxRef.current?.close(); } catch { /* already closed */ }
    };
  }, [capsule?.id, isRare]);

  if (!capsule) return null;

  // The entire scene tilts slightly with device orientation — parallax
  const sceneTransform = `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`;

  return (
    <div style={s.root} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {/* Radial flash background (2D layer, behind everything) */}
      <div style={{ ...s.flash, background: `radial-gradient(circle at 50% 50%, ${color}55 0%, transparent 60%)` }} />

      {/* 3D stage — everything inside has real depth */}
      <div style={{ ...s.stage, transform: sceneTransform }}>

        {/* Deep back particles (far) */}
        {particles.filter((p) => p.depth < -40).map((p) => (
          <Particle key={p.id} p={p} color={color} />
        ))}

        {/* Shock rings — 3D tilted discs */}
        <div style={{
          ...s.shockDisc,
          borderColor: color,
          boxShadow: `0 0 60px ${color}`,
          animation: 'foundDiscExpand 1.1s cubic-bezier(.1,.6,.3,1) forwards',
        }} />
        <div style={{
          ...s.shockDisc2,
          borderColor: `${color}aa`,
          animation: 'foundDiscExpand2 1.4s cubic-bezier(.1,.6,.3,1) 0.12s forwards',
        }} />
        {isRare && (
          <div style={{
            ...s.shockDisc3,
            borderColor: `${color}66`,
            animation: 'foundDiscExpand3 1.8s cubic-bezier(.1,.6,.3,1) 0.25s forwards',
          }} />
        )}

        {/* Vertical light beam (rare+ only) */}
        {isRare && stage >= 1 && (
          <div style={{
            ...s.beam,
            background: `linear-gradient(to top, ${color}00, ${color}aa 30%, ${color}66 70%, ${color}00)`,
            boxShadow: `0 0 30px ${color}, 0 0 60px ${color}88`,
          }} />
        )}

        {/* Portal core (at center depth) */}
        {stage >= 2 && (
          <div style={s.portalWrap}>
            {/* Outer ring — tilted disc */}
            <div style={{
              ...s.portalDisc,
              borderColor: `${color}88`,
              boxShadow: `0 0 50px ${color}, inset 0 0 40px ${color}77`,
            }} />
            {/* Inner glowing core — faces camera */}
            <div style={{
              ...s.portalCore,
              background: `radial-gradient(circle, ${color} 0%, ${color}cc 35%, ${color}55 65%, transparent 80%)`,
            }} />
            {/* Icon (faces camera, counter-rotated so it stays upright) */}
            <div style={s.portalIcon}>
              {rarity.key !== 'common' ? rarity.icon : cType.icon}
            </div>
          </div>
        )}

        {/* Near front particles */}
        {particles.filter((p) => p.depth >= -40).map((p) => (
          <Particle key={p.id} p={p} color={color} />
        ))}
      </div>

      {/* 2D HUD layer (outside 3D stage, always readable) */}
      {stage >= 2 && (
        <div style={{ ...s.labelWrap, animation: 'foundLabelIn 0.5s 0.3s both' }}>
          <div style={s.foundTag}>PORTAL ENCONTRADO</div>
          <div style={{ ...s.rarityTitle, color, textShadow: `0 2px 20px ${color}, 0 0 40px ${color}88` }}>
            {rarity.key !== 'common' ? `${rarity.icon} ${rarity.label.toUpperCase()}` : 'Descoberta'}
          </div>
          {cType.key !== 'standard' && (
            <div style={s.typeTag}>{cType.icon} {cType.label}</div>
          )}
        </div>
      )}

      {stage >= 3 && (
        <div style={s.ctaWrap}>
          <button
            style={{ ...s.openBtn, background: `linear-gradient(135deg, ${color}, ${color}cc)`, color: '#0a0814', boxShadow: `0 6px 28px rgba(0,0,0,0.5), 0 0 24px ${color}` }}
            onClick={onOpen}
          >
            Abrir Portal
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button style={s.laterBtn} onClick={onClose}>Depois</button>
        </div>
      )}
    </div>
  );
}

// Depth-aware particle — size, opacity, blur scale with Z position for real parallax
function Particle({ p, color }) {
  // Particles further from camera are smaller/dimmer/softer
  const depthNorm = (p.depth + 140) / 300; // 0..1
  const sizeScale = 0.6 + depthNorm * 0.8;
  const opacity = 0.5 + depthNorm * 0.5;
  const blur = Math.max(0, (1 - depthNorm) * 1.2);

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%', left: '50%',
        width: p.size * sizeScale, height: p.size * sizeScale,
        background: color,
        boxShadow: `0 0 ${p.size * 2}px ${color}`,
        borderRadius: '50%',
        opacity,
        filter: blur > 0.1 ? `blur(${blur}px)` : 'none',
        transformStyle: 'preserve-3d',
        animationDelay: `${p.delay}ms`,
        animationDuration: `${p.dur}ms`,
        animationFillMode: 'forwards',
        animationName: 'foundParticle3D',
        animationTimingFunction: 'cubic-bezier(.2,.7,.3,1)',
        ['--angle']: `${p.angle}deg`,
        ['--dist']: `${p.dist}px`,
        ['--depth']: `${p.depth}px`,
      }}
    />
  );
}

const s = {
  root: {
    position: 'fixed', inset: 0, zIndex: 10005,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(2,1,8,0.5)',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    pointerEvents: 'auto',
    animation: 'foundFadeIn 0.25s',
    perspective: '1200px',
    perspectiveOrigin: '50% 50%',
  },
  flash: {
    position: 'absolute', inset: 0,
    animation: 'foundFlash 0.6s ease-out',
    pointerEvents: 'none',
    zIndex: 0,
  },
  stage: {
    position: 'absolute',
    top: '50%', left: '50%',
    width: 0, height: 0,
    transformStyle: 'preserve-3d',
    transition: 'transform 0.25s cubic-bezier(.2,.8,.2,1)',
    pointerEvents: 'none',
  },
  shockDisc: {
    position: 'absolute',
    top: 0, left: 0,
    width: 80, height: 80,
    marginTop: -40, marginLeft: -40,
    borderRadius: '50%',
    border: '3px solid',
    transform: 'rotateX(55deg)',
    transformStyle: 'preserve-3d',
    pointerEvents: 'none',
  },
  shockDisc2: {
    position: 'absolute',
    top: 0, left: 0,
    width: 80, height: 80,
    marginTop: -40, marginLeft: -40,
    borderRadius: '50%',
    border: '2px solid',
    transform: 'rotateX(60deg)',
    pointerEvents: 'none',
  },
  shockDisc3: {
    position: 'absolute',
    top: 0, left: 0,
    width: 80, height: 80,
    marginTop: -40, marginLeft: -40,
    borderRadius: '50%',
    border: '1.5px solid',
    transform: 'rotateX(65deg)',
    pointerEvents: 'none',
  },
  beam: {
    position: 'absolute',
    top: '-60vh', left: -3,
    width: 6, height: '120vh',
    pointerEvents: 'none',
    transform: 'translateZ(-50px)',
    animation: 'foundBeamIn 0.8s cubic-bezier(.2,.8,.2,1), foundBeamFade 1.8s 0.5s ease-out forwards',
  },
  portalWrap: {
    position: 'absolute',
    top: 0, left: 0,
    transformStyle: 'preserve-3d',
    animation: 'foundPortalIn 0.6s cubic-bezier(.2,.8,.2,1)',
    pointerEvents: 'none',
  },
  portalDisc: {
    position: 'absolute',
    top: 0, left: 0,
    width: 160, height: 160,
    marginTop: -80, marginLeft: -80,
    borderRadius: '50%',
    border: '2.5px solid',
    transform: 'rotateX(58deg)',
    animation: 'foundDiscSpin 6s linear infinite',
  },
  portalCore: {
    position: 'absolute',
    top: 0, left: 0,
    width: 110, height: 110,
    marginTop: -55, marginLeft: -55,
    borderRadius: '50%',
    transform: 'translateZ(10px)',
    animation: 'foundCorePulse 2.2s ease-in-out infinite',
  },
  portalIcon: {
    position: 'absolute',
    top: -18, left: -18,
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '2.3rem', color: '#fff',
    transform: 'translateZ(40px)',
    textShadow: '0 0 16px rgba(0,0,0,0.5)',
    animation: 'foundIconFloat 3.2s ease-in-out infinite',
  },
  labelWrap: {
    position: 'absolute',
    bottom: '28%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    pointerEvents: 'none',
    zIndex: 10,
  },
  foundTag: {
    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.3em',
    color: 'rgba(255,255,255,0.55)',
  },
  rarityTitle: {
    fontSize: '1.7rem', fontWeight: 800, letterSpacing: '0.06em',
  },
  typeTag: {
    fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)',
    fontWeight: 600, letterSpacing: '0.04em',
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    animation: 'foundCtaIn 0.4s cubic-bezier(.2,.8,.2,1) both',
    pointerEvents: 'auto',
    zIndex: 10,
  },
  openBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 34px', borderRadius: 16, border: 'none',
    fontSize: '0.95rem', fontWeight: 800, fontFamily: 'inherit',
    letterSpacing: '0.04em',
    animation: 'foundCtaPulse 2.4s ease-in-out infinite',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    cursor: 'pointer',
  },
  laterBtn: {
    padding: '8px 20px', borderRadius: 10, border: 'none',
    background: 'transparent', color: 'rgba(255,255,255,0.45)',
    fontSize: '0.65rem', fontWeight: 600, fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    cursor: 'pointer',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('xportl-found-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-found-kf';
  style.textContent = `
    @keyframes foundFadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes foundFlash {
      0% { opacity: 0; }
      15% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes foundDiscExpand {
      0% { width: 20px; height: 20px; margin-top: -10px; margin-left: -10px; opacity: 0.9; border-width: 4px; }
      100% { width: 540px; height: 540px; margin-top: -270px; margin-left: -270px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes foundDiscExpand2 {
      0% { width: 20px; height: 20px; margin-top: -10px; margin-left: -10px; opacity: 0.7; border-width: 3px; }
      100% { width: 700px; height: 700px; margin-top: -350px; margin-left: -350px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes foundDiscExpand3 {
      0% { width: 20px; height: 20px; margin-top: -10px; margin-left: -10px; opacity: 0.5; border-width: 2px; }
      100% { width: 880px; height: 880px; margin-top: -440px; margin-left: -440px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes foundParticle3D {
      0% {
        transform: translate(0, 0) translateZ(0);
        opacity: 0;
      }
      15% { opacity: 1; }
      60% { opacity: 1; }
      100% {
        transform:
          translate(calc(cos(var(--angle)) * var(--dist)), calc(sin(var(--angle)) * var(--dist)))
          translateZ(var(--depth))
          scale(0.2);
        opacity: 0;
      }
    }
    @keyframes foundPortalIn {
      0% { transform: scale(0) rotateZ(-90deg); opacity: 0; }
      60% { transform: scale(1.15) rotateZ(10deg); opacity: 1; }
      100% { transform: scale(1) rotateZ(0deg); opacity: 1; }
    }
    @keyframes foundDiscSpin {
      from { transform: rotateX(58deg) rotateZ(0deg); }
      to { transform: rotateX(58deg) rotateZ(360deg); }
    }
    @keyframes foundCorePulse {
      0%, 100% { transform: translateZ(10px) scale(1); opacity: 0.9; }
      50% { transform: translateZ(30px) scale(1.1); opacity: 1; }
    }
    @keyframes foundIconFloat {
      0%, 100% { transform: translateZ(40px) translateY(0); }
      50% { transform: translateZ(60px) translateY(-4px); }
    }
    @keyframes foundBeamIn {
      0% { transform: translateZ(-50px) scaleY(0); opacity: 0; }
      100% { transform: translateZ(-50px) scaleY(1); opacity: 1; }
    }
    @keyframes foundBeamFade {
      0% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes foundLabelIn {
      0% { transform: translateY(16px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes foundCtaIn {
      0% { transform: translateY(24px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
    @keyframes foundCtaPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04); }
    }
  `;
  document.head.appendChild(style);
}
