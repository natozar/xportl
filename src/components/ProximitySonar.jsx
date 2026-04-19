import { useEffect, useRef, useState } from 'react';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { getRarity } from '../services/capsules';
import { getBearing } from '../utils/huntable';

/**
 * ProximitySonar — metal-detector guide to ONE specific capsule.
 *
 * Activates only when `target` is passed (hunt mode engaged). When null,
 * the sonar is fully silent: no audio context, no vibration, no render.
 *
 * Distance bands control pulse interval + audio frequency. Panning uses
 * the bearing to target vs current compass heading for left/right cues.
 *
 * Respects: paused state, low battery (softer), night mode (quieter).
 */

const PULSE_BANDS = [
  { maxDist: 5,   interval: 300,  pattern: [40, 20, 40] },
  { maxDist: 15,  interval: 600,  pattern: [30, 15, 30] },
  { maxDist: 30,  interval: 1000, pattern: [25] },
  { maxDist: 60,  interval: 1800, pattern: [20] },
  { maxDist: 150, interval: 3000, pattern: [15] },
  { maxDist: 500, interval: 5000, pattern: [10] },
];

export default function ProximitySonar({
  target, distance, userLat, userLng,
  paused = false, lowBattery = false, isNight = false,
}) {
  const { getHeading } = useDeviceOrientation();
  const audioCtxRef = useRef(null);
  const pannerRef = useRef(null);
  const gainRef = useRef(null);
  const oscRef = useRef(null);
  const pulseTimerRef = useRef(null);
  const [sonarActive, setSonarActive] = useState(false);
  const activatedRef = useRef(false);

  const active = !!target && !paused;

  // ── Activate audio on first user gesture (browser policy) ──
  useEffect(() => {
    if (activatedRef.current) return;
    const activate = () => {
      if (activatedRef.current) return;
      activatedRef.current = true;

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;

        const panner = ctx.createStereoPanner();
        const gain = ctx.createGain();
        gain.gain.value = 0;

        osc.connect(panner);
        panner.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        oscRef.current = osc;
        pannerRef.current = panner;
        gainRef.current = gain;
        setSonarActive(true);
      } catch (e) {
        console.warn('[XPortl] Sonar audio init failed:', e);
      }

      window.removeEventListener('touchstart', activate);
      window.removeEventListener('click', activate);
    };

    window.addEventListener('touchstart', activate, { once: true });
    window.addEventListener('click', activate, { once: true });
    return () => {
      window.removeEventListener('touchstart', activate);
      window.removeEventListener('click', activate);
    };
  }, []);

  // ── Sonar loop: vibration + audio ──
  useEffect(() => {
    if (!active || !sonarActive) {
      if (gainRef.current) gainRef.current.gain.value = 0;
      if (pulseTimerRef.current) { clearInterval(pulseTimerRef.current); pulseTimerRef.current = null; }
      return;
    }

    const dist = distance ?? target.distance_meters ?? 0;
    const rarity = getRarity(target);

    const band = PULSE_BANDS.find((b) => dist <= b.maxDist) || PULSE_BANDS[PULSE_BANDS.length - 1];

    // Vibration (skip if low battery)
    if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    if (!lowBattery) {
      pulseTimerRef.current = setInterval(() => {
        if (navigator.vibrate) navigator.vibrate(band.pattern);
      }, band.interval);
    }

    // Closeness: 1 at 0m → 0 at 150m
    const closeness = Math.max(0, 1 - Math.min(dist, 150) / 150);
    const freq = 220 + closeness * 660;

    // Volume baseline + rarity emphasis
    let vol = 0.02 + closeness * 0.13;
    if (isNight) vol *= 0.5;
    if (lowBattery) vol *= 0.6;

    // Spatial pan
    let pan = 0;
    if (userLat != null && userLng != null) {
      const bearing = getBearing(userLat, userLng, target.lat, target.lng);
      const heading = getHeading() || 0;
      let rel = bearing - heading;
      while (rel > 180) rel -= 360;
      while (rel < -180) rel += 360;
      pan = Math.max(-1, Math.min(1, rel / 90));
    }

    // Rarity pitch bonus
    const rarityBonus = rarity.key === 'mythic' ? 200
      : rarity.key === 'legendary' ? 100
      : rarity.key === 'rare' ? 50 : 0;

    if (oscRef.current && gainRef.current && pannerRef.current) {
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      oscRef.current.frequency.setTargetAtTime(freq + rarityBonus, now, 0.1);
      gainRef.current.gain.setTargetAtTime(vol, now, 0.1);
      pannerRef.current.pan.setTargetAtTime(pan, now, 0.1);
    }

    return () => {
      if (pulseTimerRef.current) { clearInterval(pulseTimerRef.current); pulseTimerRef.current = null; }
    };
  }, [active, sonarActive, target?.id, distance, userLat, userLng, getHeading, lowBattery, isNight]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
      if (oscRef.current) { try { oscRef.current.stop(); } catch { /* already stopped */ } }
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch { /* already closed */ } }
    };
  }, []);

  // ── Visual indicator (only when actively hunting) ──
  if (!target) return null;

  const dist = distance ?? target.distance_meters ?? 0;
  const closeness = Math.max(0, 1 - Math.min(dist, 150) / 150);
  const rarity = getRarity(target);
  const color = rarity.key !== 'common' ? rarity.color : '#00f0ff';
  const band = PULSE_BANDS.find((b) => dist <= b.maxDist) || PULSE_BANDS[PULSE_BANDS.length - 1];
  const pulseDur = band.interval / 1000;

  return (
    <div style={st.container}>
      <div style={{
        ...st.ring,
        borderColor: paused ? 'rgba(255,200,60,0.4)' : `${color}${Math.round(30 + closeness * 50).toString(16).padStart(2, '0')}`,
        animation: paused ? 'none' : `sonarPing ${pulseDur}s ease-out infinite`,
      }} />
      <div style={{
        ...st.ring,
        borderColor: paused ? 'rgba(255,200,60,0.2)' : `${color}${Math.round(15 + closeness * 30).toString(16).padStart(2, '0')}`,
        animation: paused ? 'none' : `sonarPing ${pulseDur}s ease-out infinite`,
        animationDelay: `${pulseDur * 0.4}s`,
      }} />

      <div style={st.distWrap}>
        <span style={{ ...st.dist, color: paused ? 'rgba(255,200,60,0.9)' : color }}>
          {dist < 1 ? '<1m' : dist < 100 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(1)}km`}
        </span>
      </div>
    </div>
  );
}

const st = {
  container: {
    position: 'fixed',
    bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
    right: 14,
    width: 52, height: 52,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'none', zIndex: 9998,
  },
  ring: {
    position: 'absolute', inset: 0,
    borderRadius: '50%',
    border: '1.5px solid rgba(0,240,255,0.15)',
    pointerEvents: 'none',
  },
  distWrap: {
    position: 'relative', zIndex: 2,
    padding: '4px 8px', borderRadius: 8,
    background: 'rgba(5,3,15,0.8)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  },
  dist: {
    fontSize: '0.6rem', fontWeight: 700,
    fontFamily: 'ui-monospace, monospace',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('xportl-sonar-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-sonar-kf';
  style.textContent = `@keyframes sonarPing { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }`;
  document.head.appendChild(style);
}
