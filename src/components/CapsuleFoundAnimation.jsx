import { useEffect, useRef, useState } from 'react';
import { getRarity, getCapsuleType } from '../services/capsules';

/**
 * CapsuleFoundAnimation — plays when the user reaches a hunted capsule.
 *
 * Stages (total ~2.2s):
 *   0ms    shock ring + flash
 *   120ms  particle burst
 *   300ms  portal materialize
 *   700ms  rarity label slide up
 *   1800ms call-to-action pulse
 *
 * Audio: cinematic "encontrou" chord (3-note arpeggio).
 * Haptic: ascending pattern.
 */

const PARTICLE_COUNT = 24;

export default function CapsuleFoundAnimation({ capsule, onClose, onOpen }) {
  const [stage, setStage] = useState(0); // 0→1→2→3 progression
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      angle: (i / PARTICLE_COUNT) * 360 + Math.random() * 15,
      dist: 40 + Math.random() * 140,
      delay: Math.random() * 80,
      size: 3 + Math.random() * 5,
    }))
  );
  const audioCtxRef = useRef(null);

  const rarity = capsule ? getRarity(capsule) : null;
  const cType = capsule ? getCapsuleType(capsule) : null;
  const color = rarity && rarity.key !== 'common' ? rarity.color : '#00f0ff';
  const isRare = rarity && rarity.key !== 'common';

  // Sound + haptic on mount
  useEffect(() => {
    if (!capsule) return;

    // Haptic — ascending crescendo
    if (navigator.vibrate) {
      const pattern = isRare
        ? [30, 40, 50, 30, 80, 40, 140]
        : [25, 40, 40, 30, 90];
      navigator.vibrate(pattern);
    }

    // Audio — arpeggiated chord
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;

      const notes = isRare
        ? [440, 554.37, 659.25, 880]   // A, C#, E, A (major)
        : [329.63, 415.3, 493.88];      // E, G#, B

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

      // Low sub-bass "impact" for rarer capsules
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

    // Stage progression
    const t1 = setTimeout(() => setStage(1), 120);
    const t2 = setTimeout(() => setStage(2), 300);
    const t3 = setTimeout(() => setStage(3), 1800);

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      try { audioCtxRef.current?.close(); } catch { /* already closed */ }
    };
  }, [capsule?.id, isRare]);

  if (!capsule) return null;

  return (
    <div style={s.root} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      {/* Flash background */}
      <div style={{ ...s.flash, background: `radial-gradient(circle at 50% 50%, ${color}55 0%, transparent 60%)` }} />

      {/* Shock ring(s) */}
      <div style={{ ...s.shock, borderColor: color, boxShadow: `0 0 60px ${color}` }} />
      <div style={{ ...s.shock2, borderColor: `${color}aa` }} />
      {isRare && <div style={{ ...s.shock3, borderColor: `${color}66` }} />}

      {/* Particle burst */}
      <div style={s.particlesWrap}>
        {particles.map((p) => (
          <div
            key={p.id}
            style={{
              ...s.particle,
              width: p.size, height: p.size,
              background: color,
              boxShadow: `0 0 ${p.size * 2}px ${color}`,
              ['--angle']: `${p.angle}deg`,
              ['--dist']: `${p.dist}px`,
              animationDelay: `${p.delay}ms`,
            }}
          />
        ))}
      </div>

      {/* Portal core */}
      {stage >= 2 && (
        <div style={s.portalWrap}>
          <div style={{ ...s.portalOuter, borderColor: `${color}66`, boxShadow: `0 0 40px ${color}aa, inset 0 0 30px ${color}55` }}>
            <div style={{ ...s.portalInner, background: `radial-gradient(circle, ${color} 0%, ${color}99 40%, transparent 75%)` }} />
            <div style={{ ...s.portalIcon, color: '#fff' }}>
              {rarity.key !== 'common' ? rarity.icon : cType.icon}
            </div>
          </div>
        </div>
      )}

      {/* Rarity label */}
      {stage >= 2 && (
        <div style={{ ...s.labelWrap, animation: 'foundLabelIn 0.5s 0.3s both' }}>
          <div style={s.foundTag}>PORTAL ENCONTRADO</div>
          <div style={{ ...s.rarityTitle, color }}>
            {rarity.key !== 'common' ? `${rarity.icon} ${rarity.label.toUpperCase()}` : 'Descoberta'}
          </div>
          {cType.key !== 'standard' && (
            <div style={s.typeTag}>{cType.icon} {cType.label}</div>
          )}
        </div>
      )}

      {/* CTAs */}
      {stage >= 3 && (
        <div style={s.ctaWrap}>
          <button
            style={{ ...s.openBtn, background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
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

const s = {
  root: {
    position: 'fixed', inset: 0, zIndex: 10005,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(2,1,8,0.55)',
    backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
    pointerEvents: 'auto',
    animation: 'foundFadeIn 0.25s',
  },
  flash: {
    position: 'absolute', inset: 0,
    animation: 'foundFlash 0.6s ease-out',
    pointerEvents: 'none',
  },
  shock: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: '50%',
    border: '3px solid',
    animation: 'foundShock 1.1s cubic-bezier(.1,.6,.3,1) forwards',
    pointerEvents: 'none',
  },
  shock2: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: '50%',
    border: '2px solid',
    animation: 'foundShock2 1.4s cubic-bezier(.1,.6,.3,1) 0.12s forwards',
    pointerEvents: 'none',
  },
  shock3: {
    position: 'absolute',
    width: 80, height: 80, borderRadius: '50%',
    border: '1.5px solid',
    animation: 'foundShock3 1.8s cubic-bezier(.1,.6,.3,1) 0.25s forwards',
    pointerEvents: 'none',
  },
  particlesWrap: {
    position: 'absolute',
    width: 0, height: 0,
    top: '50%', left: '50%',
    pointerEvents: 'none',
  },
  particle: {
    position: 'absolute',
    top: 0, left: 0,
    borderRadius: '50%',
    animation: 'foundParticle 1.2s cubic-bezier(.2,.7,.3,1) forwards',
  },
  portalWrap: {
    position: 'absolute',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'foundPortalIn 0.6s cubic-bezier(.2,.8,.2,1)',
    pointerEvents: 'none',
  },
  portalOuter: {
    width: 140, height: 140, borderRadius: '50%',
    border: '2px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    animation: 'foundPortalSpin 8s linear infinite',
  },
  portalInner: {
    width: 100, height: 100, borderRadius: '50%',
    animation: 'foundPortalPulse 2s ease-in-out infinite',
  },
  portalIcon: {
    position: 'absolute',
    fontSize: '2.4rem',
    textShadow: '0 0 16px rgba(0,0,0,0.5)',
    animation: 'foundIconFloat 3s ease-in-out infinite',
  },
  labelWrap: {
    position: 'absolute',
    bottom: '28%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    pointerEvents: 'none',
  },
  foundTag: {
    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.3em',
    color: 'rgba(255,255,255,0.55)',
  },
  rarityTitle: {
    fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.06em',
    textShadow: '0 2px 20px currentColor',
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
  },
  openBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 34px', borderRadius: 16, border: 'none',
    color: '#0a0814', fontSize: '0.95rem', fontWeight: 800, fontFamily: 'inherit',
    letterSpacing: '0.04em',
    boxShadow: '0 6px 28px rgba(0,0,0,0.5), 0 0 24px currentColor',
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

// Keyframes — injected once
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
    @keyframes foundShock {
      0% { width: 20px; height: 20px; opacity: 0.9; border-width: 4px; }
      100% { width: 480px; height: 480px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes foundShock2 {
      0% { width: 20px; height: 20px; opacity: 0.7; border-width: 3px; }
      100% { width: 620px; height: 620px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes foundShock3 {
      0% { width: 20px; height: 20px; opacity: 0.5; border-width: 2px; }
      100% { width: 780px; height: 780px; opacity: 0; border-width: 0.5px; }
    }
    @keyframes foundParticle {
      0% { transform: translate(0, 0) scale(0.6); opacity: 1; }
      60% { opacity: 1; }
      100% {
        transform: translate(calc(cos(var(--angle)) * var(--dist)), calc(sin(var(--angle)) * var(--dist))) scale(0);
        opacity: 0;
      }
    }
    @keyframes foundPortalIn {
      0% { transform: scale(0) rotate(-90deg); opacity: 0; }
      60% { transform: scale(1.15) rotate(10deg); opacity: 1; }
      100% { transform: scale(1) rotate(0deg); opacity: 1; }
    }
    @keyframes foundPortalSpin {
      from { transform: rotate(0deg); } to { transform: rotate(360deg); }
    }
    @keyframes foundPortalPulse {
      0%, 100% { transform: scale(1); opacity: 0.9; filter: blur(0px); }
      50% { transform: scale(1.08); opacity: 1; filter: blur(2px); }
    }
    @keyframes foundIconFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
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
