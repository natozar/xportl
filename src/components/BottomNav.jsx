import React from 'react';

const TABS = [
  {
    id: 'explore',
    label: 'Explorar',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5" />
        <polygon points="12,7 14,11 18,11 15,14 16,18 12,15.5 8,18 9,14 6,11 10,11"
          stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1" fill={active ? 'rgba(0,240,255,0.15)' : 'none'} />
      </svg>
    ),
  },
  {
    id: 'map',
    label: 'Mapa',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 7l6-3 6 3 6-3v14l-6 3-6-3-6 3V7z" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5"
          fill={active ? 'rgba(0,240,255,0.08)' : 'none'} />
        <line x1="9" y1="4" x2="9" y2="18" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1" opacity="0.4" />
        <line x1="15" y1="6" x2="15" y2="20" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1" opacity="0.4" />
      </svg>
    ),
  },
  {
    id: 'indoor',
    label: 'Indoor',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" stroke={active ? '#b44aff' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" stroke={active ? '#b44aff' : 'currentColor'} strokeWidth="1.5"
          fill={active ? 'rgba(180,74,255,0.15)' : 'none'} />
        <path d="M12 5v2m0 10v2m-5-7h2m8 0h2" stroke={active ? '#b44aff' : 'currentColor'} strokeWidth="1" opacity="0.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'create',
    label: 'Criar',
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5"
          fill={active ? 'rgba(0,240,255,0.08)' : 'none'} />
        <line x1="12" y1="7" x2="12" y2="17" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" />
        <line x1="7" y1="12" x2="17" y2="12" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'profile',
    label: 'Perfil',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5" />
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav style={s.nav}>
      {TABS.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            style={{ ...s.tab, ...(active ? s.tabActive : {}) }}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon(active)}
            <span style={{ ...s.label, ...(active ? s.labelActive : {}) }}>
              {tab.label}
            </span>
            {active && <div style={s.indicator} />}
          </button>
        );
      })}
    </nav>
  );
}

const s = {
  nav: {
    position: 'fixed',
    bottom: 0, left: 0, right: 0,
    zIndex: 9998,
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    background: 'rgba(7, 4, 15, 0.85)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    padding: '8px 0 4px',
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'inherit',
    position: 'relative',
    transition: 'color 0.2s',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'auto',
  },
  tabActive: {
    color: '#00f0ff',
  },
  label: {
    fontSize: '0.52rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
  },
  labelActive: {
    color: '#00f0ff',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: '30%',
    right: '30%',
    height: 2,
    borderRadius: '0 0 2px 2px',
    background: '#00f0ff',
    boxShadow: '0 0 8px rgba(0, 240, 255, 0.4)',
  },
};
