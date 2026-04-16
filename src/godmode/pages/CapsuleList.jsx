import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';

export default function CapsuleList() {
  const [capsules, setCapsules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('capsules')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (err) { setError(err.message); setLoading(false); return; }
      setCapsules(data || []);
      setLoading(false);
    })();
  }, []);

  const deleteCapsule = async (id) => {
    if (!confirm('Deletar permanentemente?')) return;
    await supabase.from('capsules').delete().eq('id', id);
    setCapsules((prev) => prev.filter((c) => c.id !== id));
  };

  if (loading) return <div style={st.loading}>Carregando capsulas...</div>;
  if (error) return <div style={st.error}>Erro: {error}</div>;
  if (capsules.length === 0) return <div style={st.empty}>Nenhuma capsula no banco de dados.</div>;

  return (
    <div>
      <h1 style={st.h1}>todas as capsulas ({capsules.length})</h1>

      <div style={st.grid}>
        {capsules.map((cap) => {
          const isLocked = cap.unlock_date && new Date(cap.unlock_date) > new Date();
          const color = cap.moderation_status === 'removed' ? '#ff3366'
            : cap.flag_count > 0 ? '#ffaa00'
            : isLocked ? '#b44aff'
            : cap.visibility_layer === 'ghost' ? '#b44aff'
            : cap.visibility_layer === 'private' ? '#00e5ff'
            : '#00ff88';

          return (
            <div key={cap.id} style={{ ...st.card, borderColor: color + '33' }}>
              {/* Image preview */}
              {cap.media_type === 'image' && cap.media_url ? (
                <img src={cap.media_url} alt="" style={st.img} />
              ) : cap.media_type === 'video' && cap.media_url ? (
                <video src={cap.media_url} style={st.img} muted playsInline preload="metadata" />
              ) : (
                <div style={st.noImg}>
                  <span style={{ fontSize: '1.5rem' }}>
                    {cap.content?.type === 'ping' ? cap.content.emoji || '📍' : '📍'}
                  </span>
                </div>
              )}

              {/* Content */}
              <div style={st.content}>
                {/* Type badge */}
                <div style={st.badgeRow}>
                  <span style={{ ...st.badge, background: color + '22', color }}>{cap.visibility_layer}</span>
                  {cap.moderation_status !== 'active' && (
                    <span style={{ ...st.badge, background: '#ff336622', color: '#ff3366' }}>{cap.moderation_status}</span>
                  )}
                  {cap.flag_count > 0 && (
                    <span style={{ ...st.badge, background: '#ffaa0022', color: '#ffaa00' }}>{cap.flag_count} flags</span>
                  )}
                  {cap.media_type && (
                    <span style={{ ...st.badge, background: '#ffffff08', color: '#8888a0' }}>{cap.media_type}</span>
                  )}
                </div>

                {/* Text */}
                <p style={st.text}>{cap.content?.body || cap.content?.emoji || '—'}</p>

                {/* Meta */}
                <div style={st.meta}>
                  <span>{new Date(cap.created_at).toLocaleString('pt-BR')}</span>
                  <span>Views: {cap.views_count || 0}</span>
                  {cap.views_left !== null && <span>Left: {cap.views_left}</span>}
                </div>

                {/* GPS */}
                <div style={st.gps}>
                  <a
                    href={`https://www.google.com/maps?q=${cap.lat},${cap.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={st.gpsLink}
                  >
                    📍 {cap.lat.toFixed(6)}, {cap.lng.toFixed(6)}
                  </a>
                </div>

                {/* Author */}
                <div style={st.author}>
                  Autor: {cap.created_by?.slice(0, 10) || 'anon'}
                </div>

                {/* Audio player */}
                {cap.media_type === 'audio' && cap.media_url && (
                  <audio src={cap.media_url} controls style={st.audio} preload="none" />
                )}

                {/* Actions */}
                <div style={st.actions}>
                  <button style={st.deleteBtn} onClick={() => deleteCapsule(cap.id)}>Deletar</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 20, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  loading: { padding: 40, textAlign: 'center', color: '#55556a' },
  error: { padding: 20, background: '#2a0a10', color: '#ff4466', borderRadius: 8, fontSize: '0.78rem' },
  empty: { padding: 40, textAlign: 'center', color: '#55556a', background: '#0c0c1c', border: '1px dashed #1a1a30', borderRadius: 8 },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 12,
  },
  card: {
    background: '#0c0c1c',
    border: '1px solid',
    borderRadius: 12,
    overflow: 'hidden',
  },
  img: {
    width: '100%', height: 180, objectFit: 'cover', display: 'block', background: '#000',
  },
  noImg: {
    width: '100%', height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#08081a',
  },
  content: { padding: 14 },
  badgeRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 },
  badge: {
    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: 4,
  },
  text: {
    fontSize: '0.82rem', color: '#e8e8f0', lineHeight: 1.5, marginBottom: 8,
    wordBreak: 'break-word',
  },
  meta: {
    display: 'flex', gap: 10, fontSize: '0.55rem', color: '#55556a', marginBottom: 6,
  },
  gps: { marginBottom: 6 },
  gpsLink: {
    fontSize: '0.6rem', color: '#00e5ff', textDecoration: 'none',
    fontFamily: 'ui-monospace, monospace',
  },
  author: { fontSize: '0.55rem', color: '#55556a', marginBottom: 8 },
  audio: { width: '100%', height: 32, marginBottom: 8 },
  actions: { display: 'flex', gap: 6 },
  deleteBtn: {
    padding: '6px 14px', background: '#2a0a10', border: '1px solid #ff4466',
    borderRadius: 6, color: '#ff4466', fontSize: '0.6rem', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
};
