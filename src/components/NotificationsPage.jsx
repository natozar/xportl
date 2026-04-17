import { useEffect, useState } from 'react';
import { getNotifications, markAllRead } from '../services/notifications';

export default function NotificationsPage({ userId, onOpenCapsule }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getNotifications(userId).then((list) => {
      setNotifications(list);
      setLoading(false);
      // Mark all as read when page opens
      markAllRead(userId).catch(() => {});
    });
  }, [userId]);

  return (
    <div style={st.container}>
      <div style={st.header}>
        <h2 style={st.title}>Notificacoes</h2>
        {notifications.length > 0 && (
          <span style={st.count}>{notifications.length}</span>
        )}
      </div>

      {loading && (
        <div style={st.empty}>
          <div style={st.spinner} />
        </div>
      )}

      {!loading && notifications.length === 0 && (
        <div style={st.empty}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔔</div>
          <p style={st.emptyText}>Nenhuma notificacao ainda</p>
          <p style={st.emptyHint}>Quando alguem comentar nos seus portais, aparecera aqui</p>
        </div>
      )}

      {!loading && notifications.map((n) => (
        <button
          key={n.id}
          style={{ ...st.item, ...(n.read ? {} : st.itemUnread) }}
          onClick={() => n.capsuleId && onOpenCapsule?.(n.capsuleId)}
        >
          <div style={st.avatar}>
            {n.fromAvatar
              ? <img src={n.fromAvatar} alt="" style={st.avatarImg} />
              : <span style={st.avatarFallback}>{(n.fromName || '?')[0].toUpperCase()}</span>
            }
            <div style={{ ...st.typeBadge, background: n.type === 'comment' ? '#00f0ff' : '#b44aff' }}>
              {n.type === 'comment' ? '💬' : '↩'}
            </div>
          </div>
          <div style={st.content}>
            <div style={st.contentHeader}>
              <span style={st.name}>{n.fromName}</span>
              <span style={st.time}>{formatTimeAgo(n.createdAt)}</span>
            </div>
            <p style={st.body}>
              <span style={st.action}>
                {n.type === 'comment' ? 'comentou no seu portal' : 'respondeu num portal'}
              </span>
              {' — '}{n.body}
            </p>
          </div>
          {!n.read && <div style={st.unreadDot} />}
        </button>
      ))}
    </div>
  );
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

const st = {
  container: {
    position: 'fixed', inset: 0, zIndex: 50,
    background: '#0a0814',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
    overflowY: 'auto', WebkitOverflowScrolling: 'touch',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '20px 20px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  title: {
    fontSize: '1.1rem', fontWeight: 700, color: '#f0f0f8',
    margin: 0, letterSpacing: '0.01em',
  },
  count: {
    fontSize: '0.6rem', fontWeight: 700, color: '#00f0ff',
    background: 'rgba(0,240,255,0.08)', padding: '2px 8px', borderRadius: 8,
  },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '60px 20px', textAlign: 'center',
  },
  spinner: {
    width: 24, height: 24, borderRadius: '50%',
    border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff',
    animation: 'spin 0.8s linear infinite',
  },
  emptyText: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 6px' },
  emptyHint: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', maxWidth: 240 },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    width: '100%', padding: '14px 20px',
    background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.03)',
    textAlign: 'left', fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    position: 'relative',
  },
  itemUnread: {
    background: 'rgba(0,240,255,0.02)',
  },
  avatar: {
    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
    background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  avatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  avatarFallback: { fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)' },
  typeBadge: {
    position: 'absolute', bottom: -3, right: -3,
    width: 16, height: 16, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.5rem', border: '2px solid #0a0814',
  },
  content: { flex: 1, minWidth: 0 },
  contentHeader: {
    display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3,
  },
  name: { fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' },
  time: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' },
  body: {
    fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5,
    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
  },
  action: { color: 'rgba(255,255,255,0.55)', fontWeight: 600 },
  unreadDot: {
    position: 'absolute', top: 18, right: 16,
    width: 7, height: 7, borderRadius: '50%',
    background: '#00f0ff', boxShadow: '0 0 6px rgba(0,240,255,0.5)',
  },
};
