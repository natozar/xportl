import React, { useState } from 'react';
import { isCapsuleLocked, isGhostCapsule } from '../services/capsules';

export default function DebugPanel({ geo, nearbyCapsules, lastScan, supabaseOk }) {
  const [open, setOpen] = useState(false); // Starts collapsed

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={s.toggleBtn}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 4 }}>
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1" />
          <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        </svg>
        DBG
      </button>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>SYS</span>
        <button onClick={() => setOpen(false)} style={s.closeBtn}>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* GPS */}
      <div style={s.section}>
        <Row label="GPS" value={geo.granted ? 'ON' : 'OFF'} color={geo.granted ? '#00ff88' : '#ff3366'} />
        <Row label="LAT" value={geo.lat?.toFixed(7) ?? '---'} />
        <Row label="LNG" value={geo.lng?.toFixed(7) ?? '---'} />
        <Row label="ALT" value={geo.altitude !== null ? `${geo.altitude.toFixed(1)}m` : '--'} />
        <Row label="ACC" value={geo.accuracy !== null ? `${geo.accuracy.toFixed(0)}m` : '--'} />
      </div>

      {/* DB */}
      <div style={s.section}>
        <Row label="DB" value={supabaseOk === null ? '...' : supabaseOk ? 'OK' : 'ERR'} color={supabaseOk ? '#00ff88' : '#ff3366'} />
        {lastScan && <Row label="SCAN" value={lastScan} />}
      </div>

      {/* Capsules */}
      <div style={s.section}>
        <div style={s.sectionHead}>CAPS ({nearbyCapsules.length})</div>
        {nearbyCapsules.length === 0 ? (
          <div style={s.dim}>nenhuma em 50m</div>
        ) : (
          nearbyCapsules.map((cap) => {
            const locked = isCapsuleLocked(cap);
            return (
              <div key={cap.id} style={{ ...s.capItem, borderColor: locked ? 'rgba(180,74,255,0.1)' : 'rgba(0,255,136,0.08)' }}>
                <span style={{ color: locked ? '#b44aff' : '#00ff88', fontSize: '0.55rem', fontWeight: 600 }}>
                  {locked ? 'LOCKED' : cap.content?.body?.slice(0, 16) || '---'}
                  {isGhostCapsule(cap) && ` [${cap.views_left}v]`}
                  {cap.media_type && ` ${cap.media_type === 'image' ? 'IMG' : 'AUD'}`}
                </span>
                <span style={s.capDist}>
                  {cap.distance_meters < 1 ? '<1m' : `${cap.distance_meters.toFixed(0)}m`}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      <span style={{ ...s.rowValue, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

const s = {
  container: {
    position: 'fixed',
    top: 12,
    right: 8,
    width: 200,
    maxHeight: 'calc(100% - 100px)',
    overflowY: 'auto',
    zIndex: 50,
    pointerEvents: 'auto',
    background: 'rgba(8, 8, 12, 0.6)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 10,
    fontSize: '0.55rem',
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: 'rgba(180, 74, 255, 0.6)',
    fontWeight: 700,
    letterSpacing: '0.15em',
    fontSize: '0.5rem',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.2)',
    padding: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtn: {
    position: 'fixed',
    top: 12,
    right: 8,
    zIndex: 50,
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(8, 8, 12, 0.5)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.04)',
    color: 'rgba(180, 74, 255, 0.5)',
    fontSize: '0.48rem',
    fontWeight: 700,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    letterSpacing: '0.15em',
    padding: '6px 10px',
    borderRadius: 10,
  },
  section: {
    marginBottom: 8,
    padding: '6px 8px',
    background: 'rgba(255,255,255,0.015)',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.02)',
  },
  sectionHead: {
    color: 'rgba(0, 255, 136, 0.4)',
    fontWeight: 700,
    fontSize: '0.48rem',
    letterSpacing: '0.15em',
    marginBottom: 4,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1px 0',
  },
  rowLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontWeight: 600,
  },
  rowValue: {
    color: 'rgba(255,255,255,0.5)',
    fontWeight: 500,
  },
  dim: {
    color: 'rgba(255,255,255,0.12)',
    fontStyle: 'italic',
    fontSize: '0.5rem',
  },
  capItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '3px 6px',
    marginTop: 3,
    borderRadius: 6,
    border: '1px solid',
    background: 'rgba(255,255,255,0.01)',
  },
  capDist: {
    color: 'rgba(0, 229, 255, 0.5)',
    fontSize: '0.5rem',
    fontWeight: 600,
  },
};
