import { useEffect, useRef, useState, useMemo } from 'react';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';

/**
 * ───────────────────────────────────────────────────────────────────
 * CapsuleLaunchAnimation — "O PORTAL SE ANCORA"
 *
 * 2.8s cinematic for the exact moment a capsule is committed to prod.
 * Beats (ms):
 *    0   → ANTICIPAÇÃO    vignette dims, seed spawns above, haptic tick
 *   180  → DESCIDA        seed falls in a gentle parabola to GPS origin,
 *                         leaving a trail of sparks
 *   600  → IMPACTO        shockwave ring expands on the ground plane,
 *                         strong haptic TOCK, sub-bass whoosh
 *   760  → TRIANGULAÇÃO   3 satellite beams sweep in from edges and
 *                         converge on the point, pulsing twice
 *  1180  → CRISTALIZAÇÃO  capsule forms from inside-out: 3 faceted rings
 *                         rotate orthogonally, inner core ignites
 *  1600  → SELO TEMPORAL  rune glyphs orbit once, leaving a ghost trail
 *  2000  → ASSINATURA     coords + timestamp + body-or-media-hint type
 *                         out in monospace
 *  2400  → ESTABILIZAÇÃO  capsule settles, gentle ambient glow, CTAs
 *                         fade in (close / share / map)
 *
 * Rarity modifies: particle count, beam thickness, arpeggio, sub-bass.
 *    common    → 24 particles, 3 beams, triad arpeggio
 *    rare      → 40 particles, 3 beams w/ glow, major-7 arpeggio
 *    legendary → 60 particles, 4 beams, sus-4 arpeggio, sub-bass
 *    mythic    → 80 particles, 5 beams, dominant-7 arpeggio, heavier sub
 * ───────────────────────────────────────────────────────────────────
 */

const RARITY = {
  common:    { particles: 24, beams: 3, notes: [523.25, 659.25, 783.99, 987.77], sub: false, hue: 195, trail: 1 },
  rare:      { particles: 40, beams: 3, notes: [440.00, 554.37, 659.25, 830.61], sub: false, hue: 200, trail: 1.2 },
  legendary: { particles: 60, beams: 4, notes: [349.23, 440.00, 523.25, 698.46], sub: true,  hue: 280, trail: 1.4 },
  mythic:    { particles: 80, beams: 5, notes: [293.66, 392.00, 466.16, 587.33], sub: true,  hue: 24,  trail: 1.6 },
};

export default function CapsuleLaunchAnimation({ event, onClose, onShare, onViewMap }) {
  const [stage, setStage] = useState(-1); // -1 prebuffer, 0..5 beats, 6 done
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [typedCoord, setTypedCoord] = useState('');

  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const { getHeading: _gh, getPitch } = useDeviceOrientation();

  const r = useMemo(() => RARITY[event?.rarity] || RARITY.common, [event?.rarity]);

  // ── Stage orchestration ──
  useEffect(() => {
    if (!event) return;
    setStage(-1);
    const timers = [
      setTimeout(() => setStage(0), 20),     // anticipate
      setTimeout(() => setStage(1), 180),    // descend
      setTimeout(() => setStage(2), 600),    // impact
      setTimeout(() => setStage(3), 760),    // triangulation
      setTimeout(() => setStage(4), 1180),   // crystallization
      setTimeout(() => setStage(5), 1600),   // temporal seal
      setTimeout(() => setStage(6), 2000),   // signature
      setTimeout(() => setStage(7), 2400),   // stabilize / CTAs
    ];
    return () => timers.forEach(clearTimeout);
  }, [event?.id, event]);

  // ── Haptic pattern ──
  useEffect(() => {
    if (!event || !navigator.vibrate) return;
    // tick... tick ...... TOCK ... lock ... chirp ... seal
    const pattern = r.sub
      ? [18, 180, 20, 380, 110, 120, 40, 180, 40, 140, 28]
      : [14, 180, 18, 380, 80,  120, 30, 180, 30];
    navigator.vibrate(pattern);
  }, [event?.id, event, r.sub]);

  // ── Web Audio: arpeggio + impact whoosh + sub-bass ──
  useEffect(() => {
    if (!event) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const t0 = ctx.currentTime;

      // Descent whoosh → filter sweep noise (synthesized)
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.8, ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(180, t0);
      bp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.45);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0, t0);
      ng.gain.linearRampToValueAtTime(0.08, t0 + 0.12);
      ng.gain.linearRampToValueAtTime(0.22, t0 + 0.48);
      ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.75);
      noise.connect(bp); bp.connect(ng); ng.connect(ctx.destination);
      noise.start(t0); noise.stop(t0 + 0.8);

      // IMPACT thud at 600ms
      const impactOsc = ctx.createOscillator();
      const impactGain = ctx.createGain();
      impactOsc.type = 'sine';
      impactOsc.frequency.setValueAtTime(110, t0 + 0.6);
      impactOsc.frequency.exponentialRampToValueAtTime(40, t0 + 0.85);
      impactGain.gain.setValueAtTime(0, t0 + 0.6);
      impactGain.gain.linearRampToValueAtTime(0.4, t0 + 0.62);
      impactGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      impactOsc.connect(impactGain); impactGain.connect(ctx.destination);
      impactOsc.start(t0 + 0.6); impactOsc.stop(t0 + 0.95);

      // Arpeggio (starts at triangulation)
      r.notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const ta = t0 + 0.76 + i * 0.1;
        g.gain.setValueAtTime(0, ta);
        g.gain.linearRampToValueAtTime(0.12, ta + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, ta + 0.6);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(ta); osc.stop(ta + 0.7);
      });

      // Crystallization chime — 2 stacked fifths at 1.18s
      [r.notes[0] * 2, r.notes[2] * 2].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const tc = t0 + 1.18 + i * 0.03;
        g.gain.setValueAtTime(0, tc);
        g.gain.linearRampToValueAtTime(0.08, tc + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, tc + 1.1);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(tc); osc.stop(tc + 1.2);
      });

      // Sub-bass for legendary+
      if (r.sub) {
        const sub = ctx.createOscillator();
        const sg = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(55, t0 + 0.6);
        sub.frequency.exponentialRampToValueAtTime(33, t0 + 1.4);
        sg.gain.setValueAtTime(0, t0 + 0.6);
        sg.gain.linearRampToValueAtTime(0.32, t0 + 0.68);
        sg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6);
        sub.connect(sg); sg.connect(ctx.destination);
        sub.start(t0 + 0.6); sub.stop(t0 + 1.65);
      }
    } catch { /* Web Audio unavailable */ }

    return () => {
      try { audioCtxRef.current?.close(); } catch { /* already closed */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  // ── Gyro parallax (rAF-throttled) ──
  useEffect(() => {
    if (!event) return;
    const loop = () => {
      const p = getPitch() ?? 0;
      // Map pitch -20..+20 to rotateX, and use a slow oscillation for rotateY
      const rx = Math.max(-8, Math.min(8, p * 0.18));
      const ry = Math.sin(Date.now() / 1800) * 3;
      setTilt({ x: rx, y: ry });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [event?.id, event, getPitch]);

  // ── Typewriter for coord signature ──
  useEffect(() => {
    if (!event || stage < 6) return;
    const lat = (event.lat ?? 0).toFixed(5);
    const lng = (event.lng ?? 0).toFixed(5);
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const full = `${lat}° · ${lng}° · ${time}`;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTypedCoord(full.slice(0, i));
      if (i >= full.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [event, stage]);

  if (!event) return null;

  const sceneT = `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`;
  const showing = stage >= 0;

  return (
    <div
      role="dialog"
      aria-label="Cápsula ancorada"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10020,
        pointerEvents: stage >= 7 ? 'auto' : 'none',
        opacity: showing ? 1 : 0,
        transition: 'opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        perspective: 1400,
        background:
          `radial-gradient(ellipse at 50% 55%, hsla(${r.hue},100%,65%,${stage >= 2 ? 0.18 : 0.06}) 0%, transparent 55%),` +
          `radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.75), transparent 60%),` +
          'rgba(7, 4, 15, 0.72)',
        backdropFilter: `blur(${stage >= 2 ? 14 : 6}px) saturate(160%)`,
        WebkitBackdropFilter: `blur(${stage >= 2 ? 14 : 6}px) saturate(160%)`,
      }}
    >
      <style>{LAUNCH_KF}</style>

      {/* Vignette + grain */}
      <div style={vignette} />
      <div style={grain} aria-hidden="true" />

      {/* ── Scene container (parallax) ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transformStyle: 'preserve-3d',
          transform: sceneT,
          transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        {/* ═ Beat 0-1 — Seed descent ═ */}
        {stage >= 0 && stage < 3 && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              top: stage < 1 ? '20%' : '50%',
              width: stage < 1 ? 14 : 22,
              height: stage < 1 ? 14 : 22,
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              transition: `top 420ms cubic-bezier(0.55, 0, 0.65, 1), width 420ms cubic-bezier(0.55, 0, 0.65, 1), height 420ms cubic-bezier(0.55, 0, 0.65, 1)`,
              background: `radial-gradient(circle at 40% 40%, hsl(${r.hue},100%,82%), hsl(${r.hue},100%,62%) 55%, hsla(${r.hue},100%,50%,0))`,
              boxShadow: `0 0 36px hsl(${r.hue},100%,65%), 0 0 90px hsla(${r.hue},100%,60%,0.6)`,
              filter: 'blur(0.2px)',
            }}
          />
        )}

        {/* ═ Beat 2 — Shockwave rings ═ */}
        {stage >= 2 && stage < 6 && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={`sw-${i}`}
                aria-hidden="true"
                style={{
                  ...shockRing,
                  borderColor: `hsla(${r.hue},100%,70%,0.9)`,
                  animation: `launchShock 1400ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 140}ms both`,
                }}
              />
            ))}
          </>
        )}

        {/* ═ Beat 3 — Triangulation beams ═ */}
        {stage >= 3 && stage < 7 && (
          <div style={beamsWrap}>
            {Array.from({ length: r.beams }).map((_, i) => {
              const angle = (360 / r.beams) * i - 90;
              return (
                <div
                  key={`beam-${i}`}
                  aria-hidden="true"
                  style={{
                    ...beam,
                    transform: `translate(-50%, -100%) rotate(${angle}deg)`,
                    background: `linear-gradient(to bottom, transparent, hsla(${r.hue},100%,75%,0.95) 50%, transparent)`,
                    animation: `launchBeam 720ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 40}ms both`,
                  }}
                />
              );
            })}
            {/* Lock chevrons */}
            {Array.from({ length: r.beams }).map((_, i) => {
              const angle = (360 / r.beams) * i - 90;
              const rad = (angle * Math.PI) / 180;
              const dist = 110;
              return (
                <div
                  key={`chev-${i}`}
                  aria-hidden="true"
                  style={{
                    ...chevron,
                    borderColor: `hsla(${r.hue},100%,72%,0.95)`,
                    transform: `translate(calc(-50% + ${Math.cos(rad) * dist}px), calc(-50% + ${Math.sin(rad) * dist}px)) rotate(${angle + 90}deg)`,
                    animation: `launchChev 520ms cubic-bezier(0.22, 1, 0.36, 1) ${200 + i * 50}ms both`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* ═ Beat 4-5-6-7 — Capsule crystallization ═ */}
        {stage >= 4 && (
          <div style={capsuleStage} aria-hidden="true">
            {/* Inner core */}
            <div
              style={{
                ...core,
                background: `radial-gradient(circle at 40% 35%, #fff, hsl(${r.hue},100%,75%) 40%, hsla(${r.hue},100%,50%,0.6) 80%)`,
                boxShadow: `0 0 60px hsla(${r.hue},100%,65%,0.9), 0 0 140px hsla(${r.hue},100%,60%,0.55)`,
                animation: `launchCore 900ms cubic-bezier(0.22, 1, 0.36, 1) both, launchPulse 2.4s ease-in-out 900ms infinite`,
              }}
            />
            {/* Faceted rings (3 orthogonal) */}
            {[0, 60, 120].map((rot, i) => (
              <div
                key={`ring-${i}`}
                style={{
                  ...ring,
                  borderColor: `hsla(${r.hue},100%,72%,0.85)`,
                  transform: `translate(-50%,-50%) rotateX(${rot}deg) rotateY(${rot * 0.7}deg)`,
                  animation: `launchRing${i} 1200ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 60}ms both, launchSpin${i} ${8 + i * 2}s linear infinite ${900 + i * 100}ms`,
                }}
              />
            ))}

            {/* Rune glyphs orbit (beat 5+) */}
            {stage >= 5 && (
              <div style={runesOrbit}>
                {['◇', '◈', '◆', '✦', '⬡', '⬢', '◊', '✧'].slice(0, r.beams + 3).map((g, i, arr) => {
                  const ang = (360 / arr.length) * i;
                  const rad = (ang * Math.PI) / 180;
                  const rr = 82;
                  return (
                    <span
                      key={`rune-${i}`}
                      style={{
                        ...rune,
                        color: `hsla(${r.hue},100%,78%,0.95)`,
                        transform: `translate(calc(-50% + ${Math.cos(rad) * rr}px), calc(-50% + ${Math.sin(rad) * rr}px))`,
                        animation: `launchRune 620ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 40}ms both`,
                      }}
                    >{g}</span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═ Particle spray (beats 2-5) ═ */}
        {stage >= 2 && stage < 7 && (
          <div style={particleStage} aria-hidden="true">
            {Array.from({ length: r.particles }).map((_, i) => {
              const ang = (360 / r.particles) * i + Math.random() * 12;
              const rad = (ang * Math.PI) / 180;
              const dist = 80 + Math.random() * 220;
              const dz = -80 + Math.random() * 240;
              const depthNorm = (dz + 80) / 320;
              const sz = 2 + Math.random() * 4 * r.trail;
              const delay = Math.random() * 140;
              return (
                <span
                  key={`p-${i}`}
                  style={{
                    position: 'absolute',
                    left: '50%', top: '50%',
                    width: sz, height: sz,
                    borderRadius: '50%',
                    background: `hsla(${r.hue},100%,${70 + Math.random() * 15}%,${0.5 + depthNorm * 0.45})`,
                    boxShadow: `0 0 ${6 + sz}px hsla(${r.hue},100%,70%,0.7)`,
                    filter: `blur(${(1 - depthNorm) * 1.1}px)`,
                    transform: `translate3d(-50%, -50%, ${dz}px)`,
                    animation: `launchSpark 1400ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms both`,
                    '--dx': `${Math.cos(rad) * dist}px`,
                    '--dy': `${Math.sin(rad) * dist}px`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Foreground HUD: signature + CTAs ── */}
      <div style={hudWrap}>
        {stage >= 6 && (
          <div style={signatureBox}>
            <div style={sigLabel}>PORTAL ANCORADO</div>
            <div style={sigCoord}>{typedCoord}<span style={caret}>▊</span></div>
            {event.rarity && event.rarity !== 'common' && (
              <div style={{ ...sigRar, color: `hsl(${r.hue},100%,72%)`, borderColor: `hsla(${r.hue},100%,70%,0.35)` }}>
                {event.rarity.toUpperCase()}
              </div>
            )}
          </div>
        )}

        {stage >= 7 && (
          <div style={ctaBar}>
            <button
              type="button"
              onClick={onViewMap}
              style={{ ...ctaBtn, ...ctaGhost }}
            >Ver no mapa</button>
            <button
              type="button"
              onClick={onShare}
              style={{ ...ctaBtn, ...ctaPrimary, borderColor: `hsla(${r.hue},100%,70%,0.5)` }}
            >Compartilhar</button>
            <button
              type="button"
              onClick={onClose}
              style={{ ...ctaBtn, ...ctaGhost }}
            >Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────
const vignette = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.55) 100%)',
};
const grain = {
  position: 'absolute', inset: 0, pointerEvents: 'none',
  opacity: 0.5, mixBlendMode: 'overlay',
  backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.95' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.05 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
};
const shockRing = {
  position: 'absolute', left: '50%', top: '50%',
  width: 40, height: 40, borderRadius: '50%',
  border: '1px solid', transform: 'translate(-50%,-50%)',
  pointerEvents: 'none',
};
const beamsWrap = {
  position: 'absolute', left: '50%', top: '50%', width: 0, height: 0,
  pointerEvents: 'none',
};
const beam = {
  position: 'absolute', left: '50%', top: '50%',
  width: 1.5, height: 260,
  transformOrigin: 'center bottom',
  filter: 'drop-shadow(0 0 6px currentColor)',
};
const chevron = {
  position: 'absolute', left: '50%', top: '50%',
  width: 18, height: 18,
  borderLeft: '1.5px solid', borderTop: '1.5px solid',
  transformOrigin: 'center',
};
const capsuleStage = {
  position: 'absolute', left: '50%', top: '50%',
  width: 0, height: 0,
  transformStyle: 'preserve-3d',
};
const core = {
  position: 'absolute', left: '50%', top: '50%',
  width: 52, height: 52, borderRadius: '50%',
  transform: 'translate(-50%,-50%)',
};
const ring = {
  position: 'absolute', left: '50%', top: '50%',
  width: 120, height: 120, borderRadius: '50%',
  border: '1.5px solid',
  boxShadow: '0 0 24px currentColor, inset 0 0 18px currentColor',
  opacity: 0.9,
};
const runesOrbit = {
  position: 'absolute', left: '50%', top: '50%',
  width: 0, height: 0,
  animation: 'launchOrbit 8s linear infinite',
};
const rune = {
  position: 'absolute', left: '50%', top: '50%',
  fontSize: 14,
  textShadow: '0 0 8px currentColor',
};
const particleStage = {
  position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
  transformStyle: 'preserve-3d',
};
const hudWrap = {
  position: 'absolute',
  left: 0, right: 0,
  bottom: `calc(64px + env(safe-area-inset-bottom, 0px))`,
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  pointerEvents: 'none',
};
const signatureBox = {
  pointerEvents: 'none',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  animation: 'launchFadeUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
};
const sigLabel = {
  fontFamily: 'ui-monospace, JetBrains Mono, monospace',
  fontSize: '0.62rem',
  letterSpacing: '0.3em',
  color: 'rgba(244, 239, 230, 0.55)',
  textTransform: 'uppercase',
};
const sigCoord = {
  fontFamily: 'ui-monospace, JetBrains Mono, monospace',
  fontSize: '0.88rem',
  letterSpacing: '0.05em',
  color: '#F4EFE6',
  textShadow: '0 0 22px rgba(111, 247, 255, 0.35)',
};
const caret = {
  display: 'inline-block',
  marginLeft: 2,
  color: '#6FF7FF',
  animation: 'launchCaret 0.9s step-end infinite',
};
const sigRar = {
  marginTop: 2,
  padding: '4px 12px',
  borderRadius: 999,
  border: '1px solid',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.58rem',
  letterSpacing: '0.3em',
  background: 'rgba(0,0,0,0.35)',
  backdropFilter: 'blur(8px)',
};
const ctaBar = {
  pointerEvents: 'auto',
  display: 'flex', gap: 10,
  animation: 'launchFadeUp 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
};
const ctaBtn = {
  padding: '12px 22px',
  borderRadius: 999,
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  fontSize: '0.78rem',
  fontWeight: 600,
  letterSpacing: '0.02em',
  cursor: 'pointer',
  backdropFilter: 'blur(10px)',
};
const ctaPrimary = {
  background: 'rgba(244, 239, 230, 0.95)',
  color: '#07040F',
  border: '1px solid',
  boxShadow: '0 18px 44px -14px rgba(111,247,255,0.45)',
};
const ctaGhost = {
  background: 'rgba(244, 239, 230, 0.06)',
  color: 'rgba(244, 239, 230, 0.9)',
  border: '1px solid rgba(244, 239, 230, 0.18)',
};

// ─────────────────────────────────────────────────────────────────────
// Keyframes
// ─────────────────────────────────────────────────────────────────────
const LAUNCH_KF = `
@keyframes launchShock {
  0%   { width: 40px; height: 40px; opacity: 0.95; border-width: 2px; }
  70%  { width: 420px; height: 420px; opacity: 0.22; border-width: 1px; }
  100% { width: 640px; height: 640px; opacity: 0; border-width: 1px; }
}
@keyframes launchBeam {
  0%   { height: 0; opacity: 0; }
  60%  { height: 260px; opacity: 1; }
  100% { height: 260px; opacity: 0.6; }
}
@keyframes launchChev {
  0%   { opacity: 0; transform: translate(calc(-50% + var(--dx,0)), calc(-50% + var(--dy,0))) rotate(var(--r,0deg)) scale(0.4); }
  100% { opacity: 1; transform: translate(calc(-50% + var(--dx,0)), calc(-50% + var(--dy,0))) rotate(var(--r,0deg)) scale(1); }
}
@keyframes launchCore {
  0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.1); }
  55%  { opacity: 1; transform: translate(-50%,-50%) scale(1.2); }
  100% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
}
@keyframes launchPulse {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.35); }
}
@keyframes launchRing0 {
  0%   { opacity: 0; transform: translate(-50%,-50%) rotateX(0deg) rotateY(0deg) scale(0.2); }
  70%  { opacity: 1; transform: translate(-50%,-50%) rotateX(0deg) rotateY(0deg) scale(1.15); }
  100% { opacity: 1; transform: translate(-50%,-50%) rotateX(0deg) rotateY(0deg) scale(1); }
}
@keyframes launchRing1 {
  0%   { opacity: 0; transform: translate(-50%,-50%) rotateX(60deg) rotateY(42deg) scale(0.2); }
  70%  { opacity: 0.9; transform: translate(-50%,-50%) rotateX(60deg) rotateY(42deg) scale(1.15); }
  100% { opacity: 0.9; transform: translate(-50%,-50%) rotateX(60deg) rotateY(42deg) scale(1); }
}
@keyframes launchRing2 {
  0%   { opacity: 0; transform: translate(-50%,-50%) rotateX(120deg) rotateY(84deg) scale(0.2); }
  70%  { opacity: 0.75; transform: translate(-50%,-50%) rotateX(120deg) rotateY(84deg) scale(1.15); }
  100% { opacity: 0.75; transform: translate(-50%,-50%) rotateX(120deg) rotateY(84deg) scale(1); }
}
@keyframes launchSpin0 { to { transform: translate(-50%,-50%) rotateX(0deg) rotateY(360deg) scale(1); } }
@keyframes launchSpin1 { to { transform: translate(-50%,-50%) rotateX(60deg) rotateY(402deg) scale(1); } }
@keyframes launchSpin2 { to { transform: translate(-50%,-50%) rotateX(120deg) rotateY(444deg) scale(1); } }
@keyframes launchOrbit { to { transform: translate(-50%,-50%) rotate(360deg); } }
@keyframes launchRune {
  0%   { opacity: 0; }
  100% { opacity: 0.95; }
}
@keyframes launchSpark {
  0%   { opacity: 0; transform: translate3d(-50%, -50%, 0) scale(0.4); }
  20%  { opacity: 1; }
  100% {
    opacity: 0;
    transform: translate3d(calc(-50% + var(--dx)), calc(-50% + var(--dy)), 0) scale(0.25);
  }
}
@keyframes launchFadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes launchCaret {
  0%, 50%  { opacity: 1; }
  51%,100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  [style*="launchShock"],
  [style*="launchBeam"],
  [style*="launchCore"],
  [style*="launchPulse"],
  [style*="launchRing"],
  [style*="launchSpin"],
  [style*="launchOrbit"],
  [style*="launchRune"],
  [style*="launchSpark"],
  [style*="launchFadeUp"] {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`;
