import React, { useEffect, useState } from 'react';
import { getLeaderboard, BADGES, getLevelTitle } from '../services/gamification';

export default function Leaderboard({ currentUserId, onClose }) {
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLeaderboard(50).then((data) => {
      setLeaders(data);
      setLoading(false);
    });
  }, []);

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <h2 style={s.title}>LEADERBOARD</h2>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={s.list}>
          {loading ? (
            <div style={s.loading}>
              <div style={s.spinner} />
            </div>
          ) : leaders.length === 0 ? (
            <div style={s.empty}>Nenhum jogador ainda. Seja o primeiro!</div>
          ) : (
            leaders.map((user, i) => {
              const isMe = user.user_id === currentUserId;
              const rankIcon = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;

              return (
                <div key={user.user_id} style={{ ...s.row, ...(isMe ? s.rowMe : {}), ...(i < 3 ? s.rowTop : {}) }}>
                  <div style={s.rank}>
                    {rankIcon || <span style={s.rankNum}>{i + 1}</span>}
                  </div>
                  <div style={s.info}>
                    <div style={s.name}>
                      {user.display_name || 'Anonimo'}
                      {isMe && <span style={s.meTag}>voce</span>}
                    </div>
                    <div style={s.meta}>
                      Lv.{user.level} · {getLevelTitle(user.level)}
                      {user.streak_days > 0 && ` · 🔥${user.streak_days}d`}
                    </div>
                  </div>
                  <div style={s.xp}>
                    <span style={s.xpNum}>{user.total_xp.toLocaleString()}</span>
                    <span style={s.xpLabel}>XP</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 150, padding: 16, pointerEvents: 'auto',
  },
  modal: {
    background: 'rgba(12,12,18,0.95)', backdropFilter: 'blur(40px)',
    border: '1px solid rgba(0,240,255,0.1)', borderRadius: 20,
    padding: 20, maxWidth: 400, width: '100%', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: {
    fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.2em',
    color: '#00f0ff', margin: 0,
  },
  closeBtn: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b6b80',
  },
  list: { flex: 1, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 12, marginBottom: 4,
    background: 'rgba(255,255,255,0.015)',
    transition: 'background 0.15s',
  },
  rowMe: {
    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.1)',
  },
  rowTop: {
    background: 'rgba(255,255,255,0.025)',
  },
  rank: {
    width: 32, height: 32, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.1rem', flexShrink: 0,
  },
  rankNum: { fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)' },
  info: { flex: 1, minWidth: 0 },
  name: {
    fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  meTag: {
    fontSize: '0.45rem', fontWeight: 700, color: '#00f0ff',
    background: 'rgba(0,240,255,0.1)', padding: '2px 6px', borderRadius: 4,
    letterSpacing: '0.1em',
  },
  meta: { fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 2 },
  xp: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 },
  xpNum: { fontSize: '0.85rem', fontWeight: 700, color: '#00f0ff' },
  xpLabel: { fontSize: '0.45rem', color: 'rgba(0,240,255,0.5)', letterSpacing: '0.1em' },
  loading: { display: 'flex', justifyContent: 'center', padding: 40 },
  spinner: {
    width: 24, height: 24, borderRadius: '50%',
    border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff',
    animation: 'spin 0.8s linear infinite',
  },
  empty: { textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.72rem', padding: 40 },
};
