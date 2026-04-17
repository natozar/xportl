
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
    label: 'Radar',
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
    id: 'notifications',
    label: 'Alertas',
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          fill={active ? 'rgba(0,240,255,0.08)' : 'none'} />
        <path d="M13.73 21a2 2 0 01-3.46 0" stroke={active ? '#00f0ff' : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" />
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

export default function BottomNav({ activeTab, onTabChange, unreadCount = 0 }) {
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
            <div style={s.iconWrap}>
              {tab.icon(active)}
              {tab.id === 'notifications' && unreadCount > 0 && (
                <div style={s.badge}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </div>
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
    height: 'calc(64px + env(safe-area-inset-bottom, 0px))',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    background: 'rgba(5, 3, 12, 0.9)',
    backdropFilter: 'blur(30px) saturate(140%)',
    WebkitBackdropFilter: 'blur(30px) saturate(140%)',
    borderTop: '1px solid rgba(255, 255, 255, 0.03)',
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
  tabActive: { color: '#00f0ff' },
  iconWrap: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -5, right: -8,
    minWidth: 16, height: 16, borderRadius: 8,
    background: '#ff3366', color: '#fff',
    fontSize: '0.5rem', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
    boxShadow: '0 0 8px rgba(255,51,102,0.5)',
    border: '2px solid rgba(5,3,12,0.9)',
  },
  label: {
    fontSize: '0.55rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  labelActive: { color: '#00f0ff' },
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
