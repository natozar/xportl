import React from 'react';
import { isCapsuleLocked, isGhostCapsule, getTimeRemaining } from '../services/capsules';

export default function VortexModal({ vortex, onClose, onSelectCapsule }) {
  if (!vortex) return null;

  const { capsules } = vortex;

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.iconWrap}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polygon points="12,1 23,7 23,17 12,23 1,17 1,7" stroke="#00e5ff" strokeWidth="1.5" fill="rgba(0,229,255,0.08)" />
              <polygon points="12,5 19,9 19,15 12,19 5,15 5,9" stroke="#00e5ff" strokeWidth="1" fill="none" opacity="0.4" />
            </svg>
          </div>
          <div style={s.headerText}>
            <h2 style={s.title}>VORTEX</h2>
            <p style={s.subtitle}>{capsules.length} capsulas concentradas</p>
          </div>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={s.divider} />

        {/* Timeline feed */}
        <div style={s.feed}>
          {capsules.map((cap, i) => {
            const locked = isCapsuleLocked(cap);
            const ghost = isGhostCapsule(cap);
            const accent = locked ? '#b44aff' : '#00ff88';

            return (
              <button
                key={cap.id}
                style={s.feedItem}
                onClick={() => { onClose(); onSelectCapsule(cap); }}
              >
                {/* Timeline dot + line */}
                <div style={s.timeline}>
                  <div style={{ ...s.dot, background: accent, boxShadow: `0 0 8px ${accent}44` }} />
                  {i < capsules.length - 1 && <div style={s.line} />}
                </div>

                {/* Content */}
                <div style={s.itemContent}>
                  <div style={s.itemHeader}>
                    <span style={{ ...s.itemType, color: accent }}>
                      {locked ? 'TRANCADA' : ghost ? 'GHOST' : 'PUBLICA'}
                    </span>
                    {cap.media_type && (
                      <span style={s.mediaBadge}>
                        {cap.media_type === 'image' ? 'IMG' : 'AUD'}
                      </span>
                    )}
                    {ghost && cap.views_left !== null && (
                      <span style={s.viewsBadge}>{cap.views_left}v</span>
                    )}
                  </div>

                  {locked ? (
                    <p style={s.lockedText}>
                      Trancada — {getTimeRemaining(cap) || 'em breve'}
                    </p>
                  ) : (
                    <p style={s.itemText}>
                      {cap.content?.body?.slice(0, 60) || '---'}
                    </p>
                  )}

                  <span style={s.itemTime}>
                    {cap.created_at ? new Date(cap.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '---'}
                    {cap.distance_meters !== undefined && ` — ${cap.distance_meters.toFixed(0)}m`}
                  </span>
                </div>

                {/* Arrow */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2, flexShrink: 0 }}>
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 10000, padding: 16, pointerEvents: 'auto',
  },
  modal: {
    background: 'rgba(12,12,18,0.92)', backdropFilter: 'blur(40px)',
    border: '1px solid rgba(0,229,255,0.15)', borderRadius: 20,
    padding: 20, maxWidth: 400, width: '100%', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 0 60px rgba(0,229,255,0.06)',
  },
  header: { display: 'flex', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12,
    background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.12)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  headerText: { flex: 1 },
  title: {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em',
    color: '#00e5ff', textShadow: '0 0 15px rgba(0,229,255,0.3)', margin: 0,
  },
  subtitle: { fontSize: '0.55rem', color: '#6b6b80', marginTop: 3 },
  closeBtn: {
    flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b80',
  },
  divider: {
    height: 1, margin: '14px 0',
    background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.12), transparent)',
  },
  feed: {
    flex: 1, overflowY: 'auto', paddingRight: 4,
  },
  feedItem: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 8px', background: 'transparent',
    border: 'none', borderRadius: 10, color: 'var(--text-primary)',
    fontFamily: 'inherit', textAlign: 'left', width: '100%',
    transition: 'background 0.15s',
  },
  timeline: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    width: 12, flexShrink: 0, paddingTop: 4,
  },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  line: { width: 1, flex: 1, background: 'rgba(255,255,255,0.06)', marginTop: 4 },
  itemContent: { flex: 1, minWidth: 0 },
  itemHeader: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 },
  itemType: { fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em' },
  mediaBadge: {
    fontSize: '0.45rem', fontWeight: 600, color: '#6b6b80',
    background: 'rgba(255,255,255,0.04)', padding: '1px 5px', borderRadius: 4,
  },
  viewsBadge: {
    fontSize: '0.45rem', fontWeight: 700, color: '#b44aff',
    background: 'rgba(180,74,255,0.08)', padding: '1px 5px', borderRadius: 4,
  },
  itemText: {
    fontSize: '0.75rem', color: '#e8e8f0', lineHeight: 1.5,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  lockedText: {
    fontSize: '0.7rem', color: 'rgba(180,74,255,0.6)', fontStyle: 'italic',
  },
  itemTime: { fontSize: '0.5rem', color: '#6b6b80', marginTop: 4, display: 'block' },
};
