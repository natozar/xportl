import React, { useState } from 'react';

const VIBES = ['🔥', '👽', '👀', '🖤'];

export default function VibePing({ onPing }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(null);

  const handlePing = (emoji) => {
    setOpen(false);
    setSent(emoji);
    if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
    onPing(emoji);
    setTimeout(() => setSent(null), 1500);
  };

  return (
    <>
      {/* Sent feedback */}
      {sent && (
        <div style={s.sentToast}>
          <span style={s.sentEmoji}>{sent}</span>
        </div>
      )}

      {/* Emoji picker */}
      {open && (
        <div style={s.picker}>
          {VIBES.map((emoji) => (
            <button key={emoji} style={s.emojiBtn} onClick={() => handlePing(emoji)}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      {!sent && (
        <button
          style={{ ...s.fab, ...(open ? s.fabOpen : {}) }}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.73 0 3.34-.47 4.74-1.26L22 22l-1.26-5.26C21.53 15.34 22 13.73 22 12c0-5.52-4.48-10-10-10z"
                stroke="currentColor" strokeWidth="1.5" fill="none" />
              <circle cx="8" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="16" cy="12" r="1" fill="currentColor" />
            </svg>
          )}
        </button>
      )}
    </>
  );
}

const s = {
  fab: {
    position: 'fixed', bottom: 'calc(32px + env(safe-area-inset-bottom, 0px))', right: 20,
    zIndex: 35, pointerEvents: 'auto',
    width: 48, height: 48, borderRadius: '50%',
    background: 'rgba(255,170,0,0.1)',
    backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,170,0,0.25)',
    color: '#ffaa00',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 20px rgba(255,170,0,0.1)',
    transition: 'all 0.2s ease',
  },
  fabOpen: {
    background: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.15)',
    color: '#fff',
  },
  picker: {
    position: 'fixed', bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))', right: 16,
    zIndex: 36, pointerEvents: 'auto',
    display: 'flex', gap: 6,
    padding: '8px 10px',
    background: 'rgba(10,10,15,0.88)',
    backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,170,0,0.12)',
    borderRadius: 50,
    boxShadow: '0 0 30px rgba(255,170,0,0.08)',
  },
  emojiBtn: {
    width: 44, height: 44, borderRadius: '50%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    fontSize: '1.3rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.1s',
    fontFamily: 'inherit',
  },
  sentToast: {
    position: 'fixed', bottom: 'calc(90px + env(safe-area-inset-bottom, 0px))', right: 30,
    zIndex: 40, pointerEvents: 'none',
    animation: 'float 1.5s ease-out forwards',
  },
  sentEmoji: {
    fontSize: '2rem',
    filter: 'drop-shadow(0 0 12px rgba(255,170,0,0.4))',
  },
};
