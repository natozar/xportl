import { useEffect, useState } from 'react';
import { getRarity, getCapsuleType } from '../services/capsules';
import { getBearing, bearingToCardinal } from '../utils/huntable';
import { useDeviceOrientation } from '../hooks/useDeviceOrientation';

/**
 * HuntHUD — persistent top bar while hunting a single capsule.
 * Shows: rarity/type, direction arrow, distance, stop button.
 * Handles: paused state, low battery, night mode visual hints.
 */
export default function HuntHUD({
  target, distance, paused, pauseReason,
  lowBattery, isNight, userLat, userLng, onStop,
}) {
  const { getHeading } = useDeviceOrientation();
  const [heading, setHeading] = useState(0);

  useEffect(() => {
    if (!target) return;
    let raf;
    const loop = () => {
      const h = getHeading();
      if (h !== null) setHeading(h);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [target, getHeading]);

  if (!target) return null;

  const rarity = getRarity(target);
  const cType = getCapsuleType(target);
  const color = rarity.key !== 'common' ? rarity.color : '#00f0ff';

  const bearing = (userLat != null && userLng != null)
    ? getBearing(userLat, userLng, target.lat, target.lng)
    : 0;

  // Arrow: rotate relative to user heading
  let relAngle = bearing - heading;
  while (relAngle > 180) relAngle -= 360;
  while (relAngle < -180) relAngle += 360;

  const cardinal = bearingToCardinal(bearing);
  const dist = distance ?? target.distance_meters ?? 0;
  const distLabel = dist < 1 ? '<1m' : dist < 100 ? `${dist.toFixed(0)}m` : `${(dist / 1000).toFixed(2)}km`;

  const label = rarity.key !== 'common'
    ? `${rarity.label} ${cType.key !== 'standard' ? '· ' + cType.label : ''}`
    : (cType.key !== 'standard' ? cType.label : 'Portal');

  const pauseText = pauseReason === 'speed'
    ? 'Pausado — pare para retomar'
    : pauseReason === 'background'
    ? 'Pausado'
    : null;

  return (
    <div style={{ ...s.wrap, borderColor: paused ? 'rgba(255,200,60,0.3)' : `${color}40` }}>
      {/* Left: rarity icon + label */}
      <div style={s.left}>
        <div style={{ ...s.iconBubble, background: `${color}18`, borderColor: `${color}55` }}>
          <span style={{ fontSize: '0.85rem', color }}>
            {rarity.key !== 'common' ? rarity.icon : cType.icon}
          </span>
        </div>
        <div style={s.labelWrap}>
          <span style={{ ...s.label, color }}>{label}</span>
          {pauseText ? (
            <span style={s.pauseText}>{pauseText}</span>
          ) : (
            <span style={s.sub}>
              {cardinal} · {distLabel}
              {lowBattery && <span style={s.battWarn}> · bat. baixa</span>}
              {isNight && <span style={s.nightDim}> · modo noite</span>}
            </span>
          )}
        </div>
      </div>

      {/* Middle: direction arrow */}
      <div style={s.arrowWrap}>
        <svg width="30" height="30" viewBox="0 0 30 30"
          style={{
            transform: `rotate(${relAngle}deg)`,
            transition: 'transform 0.25s cubic-bezier(.2,.8,.2,1)',
            filter: paused ? 'none' : `drop-shadow(0 0 8px ${color}aa)`,
            opacity: paused ? 0.35 : 1,
          }}>
          <path d="M15 3 L22 20 L15 16 L8 20 Z" fill={paused ? 'rgba(255,200,60,0.8)' : color} stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
        </svg>
      </div>

      {/* Right: stop button */}
      <button style={s.stopBtn} onClick={onStop} aria-label="Parar caça">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </svg>
      </button>
    </div>
  );
}

const s = {
  wrap: {
    position: 'fixed',
    top: 'calc(8px + env(safe-area-inset-top, 0px))',
    left: 10, right: 10,
    zIndex: 10001,
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px',
    borderRadius: 16,
    background: 'rgba(5,3,15,0.88)',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(0,240,255,0.25)',
    boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
    pointerEvents: 'auto',
    animation: 'huntHudEnter 0.35s cubic-bezier(.2,.8,.2,1)',
  },
  left: { display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  iconBubble: {
    width: 32, height: 32, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid',
    flexShrink: 0,
  },
  labelWrap: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, overflow: 'hidden' },
  label: {
    fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  sub: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)',
    fontFamily: 'ui-monospace, monospace',
  },
  pauseText: { fontSize: '0.55rem', color: 'rgba(255,200,60,0.85)', fontWeight: 600 },
  battWarn: { color: 'rgba(255,120,120,0.7)' },
  nightDim: { color: 'rgba(180,140,255,0.6)' },
  arrowWrap: {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stopBtn: {
    width: 32, height: 32, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,51,102,0.1)', border: '1px solid rgba(255,51,102,0.25)',
    color: '#ff6688', flexShrink: 0,
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    cursor: 'pointer',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('xportl-hunt-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-hunt-kf';
  style.textContent = `@keyframes huntHudEnter { 0% { transform: translateY(-30px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }`;
  document.head.appendChild(style);
}
