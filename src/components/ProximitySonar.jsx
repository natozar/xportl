import { useEffect, useRef, useState } from 'react';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';
import { getRarity } from '../services/capsules';

/**
 * ProximitySonar — vibration pulses + spatial audio that guide
 * the user toward the nearest capsule. Like a metal detector:
 * pulses get faster and louder as you get closer.
 *
 * Also emits a directional audio tone that pans left/right
 * based on the capsule's bearing relative to the user's heading.
 */

// Pulse intervals by distance band (ms between pulses)
const PULSE_BANDS = [
  { maxDist: 5,   interval: 300,  pattern: [40, 20, 40] },     // Very close — fast double
  { maxDist: 15,  interval: 600,  pattern: [30, 15, 30] },     // Close — medium
  { maxDist: 30,  interval: 1000, pattern: [25] },              // Near — slow single
  { maxDist: 60,  interval: 1800, pattern: [20] },              // Approaching — gentle
  { maxDist: 150, interval: 3000, pattern: [15] },              // Far — very slow
];

function getBearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export default function ProximitySonar({ capsules, userLat, userLng }) {
  const { getHeading } = useDeviceOrientation();
  const audioCtxRef = useRef(null);
  const pannerRef = useRef(null);
  const gainRef = useRef(null);
  const oscRef = useRef(null);
  const pulseTimerRef = useRef(null);
  const [sonarActive, setSonarActive] = useState(false);
  const activatedRef = useRef(false);

  // Find nearest capsule
  const nearest = (capsules || [])
    .filter((c) => c.content?.type !== 'ping' && c.distance_meters !== undefined && c.distance_meters <= 150)
    .sort((a, b) => a.distance_meters - b.distance_meters)[0] || null;

  // Initialize audio context on first user interaction (required by browsers)
  useEffect(() => {
    if (activatedRef.current) return;
    const activate = () => {
      if (activatedRef.current) return;
      activatedRef.current = true;

      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;

        // Create oscillator → panner → gain → destination
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 440;

        const panner = ctx.createStereoPanner();
        const gain = ctx.createGain();
        gain.gain.value = 0; // start silent

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

  // Sonar loop: vibrate + spatial audio
  useEffect(() => {
    if (!nearest || !sonarActive) {
      // Silence when no target
      if (gainRef.current) gainRef.current.gain.value = 0;
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
      return;
    }

    const dist = nearest.distance_meters;
    const rarity = getRarity(nearest);

    // Find pulse band
    const band = PULSE_BANDS.find((b) => dist <= b.maxDist) || PULSE_BANDS[PULSE_BANDS.length - 1];

    // Vibration pulses
    if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    pulseTimerRef.current = setInterval(() => {
      if (navigator.vibrate) navigator.vibrate(band.pattern);
    }, band.interval);

    // Audio: frequency rises as you get closer (220Hz far → 880Hz close)
    const closeness = Math.max(0, 1 - dist / 150);
    const freq = 220 + closeness * 660; // 220-880Hz

    // Volume: louder when closer (0.02 far → 0.15 close)
    const vol = 0.02 + closeness * 0.13;

    // Panning: left/right based on capsule bearing vs heading
    let pan = 0;
    if (userLat && userLng) {
      const bearing = getBearing(userLat, userLng, nearest.lat, nearest.lng);
      const heading = getHeading() || 0;
      let relAngle = bearing - heading;
      while (relAngle > 180) relAngle -= 360;
      while (relAngle < -180) relAngle += 360;
      // Map ±180° to ±1 panning
      pan = Math.max(-1, Math.min(1, relAngle / 90));
    }

    // Pitch modulation by rarity (higher pitch for rarer)
    const rarityBonus = rarity.key === 'mythic' ? 200 : rarity.key === 'legendary' ? 100 : rarity.key === 'rare' ? 50 : 0;

    if (oscRef.current && gainRef.current && pannerRef.current) {
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      oscRef.current.frequency.setTargetAtTime(freq + rarityBonus, now, 0.1);
      gainRef.current.gain.setTargetAtTime(vol, now, 0.1);
      pannerRef.current.pan.setTargetAtTime(pan, now, 0.1);
    }

    return () => {
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    };
  }, [nearest?.id, nearest?.distance_meters, sonarActive, userLat, userLng, getHeading]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
      if (oscRef.current) { try { oscRef.current.stop(); } catch {} }
      if (audioCtxRef.current) { try { audioCtxRef.current.close(); } catch {} }
    };
  }, []);

  // Visual sonar pulse indicator
  if (!nearest) return null;

  const dist = nearest.distance_meters;
  const closeness = Math.max(0, 1 - dist / 150);
  const rarity = getRarity(nearest);
  const color = rarity.key !== 'common' ? rarity.color : '#00f0ff';

  // Pulse speed matches vibration interval
  const band = PULSE_BANDS.find((b) => dist <= b.maxDist) || PULSE_BANDS[PULSE_BANDS.length - 1];
  const pulseDur = band.interval / 1000;

  return (
    <div style={st.container}>
      {/* Sonar ring */}
      <div style={{
        ...st.ring,
        borderColor: `${color}${Math.round(20 + closeness * 40).toString(16).padStart(2, '0')}`,
        animation: `sonarPing ${pulseDur}s ease-out infinite`,
      }} />
      <div style={{
        ...st.ring,
        borderColor: `${color}${Math.round(10 + closeness * 20).toString(16).padStart(2, '0')}`,
        animation: `sonarPing ${pulseDur}s ease-out infinite`,
        animationDelay: `${pulseDur * 0.4}s`,
      }} />

      {/* Distance */}
      <div style={st.distWrap}>
        <span style={{ ...st.dist, color }}>
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

// Sonar animation
if (typeof document !== 'undefined' && !document.getElementById('xportl-sonar-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-sonar-kf';
  style.textContent = `@keyframes sonarPing { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2.5); opacity: 0; } }`;
  document.head.appendChild(style);
}
