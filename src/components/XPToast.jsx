import React, { useEffect, useState } from 'react';

/**
 * XP Toast — animated notification when user earns XP.
 * Auto-dismisses after 3s. Shows level-up celebration if applicable.
 */
export default function XPToast({ event, onDone }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!event) return;
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300); }, 3000);
    return () => clearTimeout(t);
  }, [event]);

  if (!event) return null;

  const isLevelUp = event.leveledUp;

  return (
    <div style={{ ...s.container, opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(-20px)' }}>
      {isLevelUp ? (
        <div style={s.levelUp}>
          <div style={s.levelUpGlow} />
          <span style={s.levelUpIcon}>⚡</span>
          <div>
            <div style={s.levelUpTitle}>NIVEL {event.newLevel}!</div>
            <div style={s.levelUpSub}>+{event.xp} XP</div>
          </div>
        </div>
      ) : (
        <div style={s.xpGain}>
          <span style={s.xpAmount}>+{event.xp}</span>
          <span style={s.xpLabel}>XP</span>
          <span style={s.xpAction}>{ACTION_LABELS[event.action] || event.action}</span>
        </div>
      )}
    </div>
  );
}

const ACTION_LABELS = {
  create_capsule: 'Portal criado',
  create_ghost: 'Ghost plantado',
  create_media: 'Midia anexada',
  discover_capsule: 'Portal descoberto',
  receive_view: 'Visualizacao',
  first_capsule: 'Primeiro portal!',
  streak_3d: 'Streak 3 dias',
  streak_7d: 'Streak 7 dias',
  streak_30d: 'Streak 30 dias',
  vortex_discovered: 'Vortex encontrado',
  ping_sent: 'Vibe enviada',
};

const s = {
  container: {
    position: 'fixed',
    top: 'calc(20px + env(safe-area-inset-top, 0px))',
    left: '50%',
    zIndex: 10001, pointerEvents: 'none',
    transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
  },
  xpGain: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '10px 18px', borderRadius: 50,
    background: 'rgba(0, 240, 255, 0.12)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0, 240, 255, 0.25)',
    boxShadow: '0 0 20px rgba(0, 240, 255, 0.15)',
  },
  xpAmount: {
    fontSize: '1rem', fontWeight: 700, color: '#00f0ff',
    textShadow: '0 0 10px rgba(0, 240, 255, 0.4)',
  },
  xpLabel: {
    fontSize: '0.6rem', fontWeight: 700, color: 'rgba(0, 240, 255, 0.6)',
    letterSpacing: '0.1em',
  },
  xpAction: {
    fontSize: '0.6rem', color: 'rgba(255, 255, 255, 0.4)',
    marginLeft: 4,
  },
  levelUp: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 24px', borderRadius: 18,
    background: 'rgba(180, 74, 255, 0.15)', backdropFilter: 'blur(24px)',
    border: '1px solid rgba(180, 74, 255, 0.35)',
    boxShadow: '0 0 30px rgba(180, 74, 255, 0.2)',
    position: 'relative', overflow: 'hidden',
  },
  levelUpGlow: {
    position: 'absolute', inset: -2, borderRadius: 20,
    border: '2px solid rgba(180, 74, 255, 0.5)',
    animation: 'pulse-ring 1s ease infinite',
  },
  levelUpIcon: { fontSize: '1.5rem' },
  levelUpTitle: {
    fontSize: '0.85rem', fontWeight: 700, color: '#b44aff',
    letterSpacing: '0.15em',
    textShadow: '0 0 15px rgba(180, 74, 255, 0.4)',
  },
  levelUpSub: {
    fontSize: '0.6rem', color: 'rgba(180, 74, 255, 0.6)',
  },
};
