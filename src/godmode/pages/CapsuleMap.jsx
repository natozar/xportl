import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';

let L = null;
async function loadLeaflet() {
  if (L) return L;
  const mod = await import('leaflet');
  L = mod.default || mod;
  if (!document.getElementById('leaflet-css-gm')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css-gm';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  return L;
}

export default function CapsuleMap() {
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const markersRef = useRef([]);

  const [capsules, setCapsules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, public: 0, ghost: 0, private: 0, locked: 0, withMedia: 0 });
  const [selected, setSelected] = useState(null);

  // Fetch ALL capsules
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('capsules')
        .select('id, lat, lng, content, visibility_layer, unlock_date, views_count, views_left, media_url, media_type, moderation_status, flag_count, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) {
        console.error('[Godmode] Capsule fetch error:', error);
        setCapsules([]);
        setLoading(false);
        alert('Erro ao buscar capsulas: ' + error.message + '\n\nSe retornou 0 capsulas, rode migration_011_admin_read_all.sql no Supabase SQL Editor.');
        return;
      }

      const caps = data || [];
      setCapsules(caps);

      const now = new Date();
      setStats({
        total: caps.length,
        public: caps.filter(c => c.visibility_layer === 'public').length,
        ghost: caps.filter(c => c.visibility_layer === 'ghost').length,
        private: caps.filter(c => c.visibility_layer === 'private').length,
        locked: caps.filter(c => c.unlock_date && new Date(c.unlock_date) > now).length,
        withMedia: caps.filter(c => c.media_url).length,
        flagged: caps.filter(c => c.flag_count > 0).length,
        removed: caps.filter(c => c.moderation_status === 'removed').length,
      });
      setLoading(false);
    })();
  }, []);

  // Init map
  useEffect(() => {
    if (loading || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const leaflet = await loadLeaflet();
      if (cancelled || !mapContainerRef.current) return;

      const center = capsules.length > 0
        ? [capsules[0].lat, capsules[0].lng]
        : [-23.55, -46.63];

      const map = leaflet.map(mapContainerRef.current, {
        center,
        zoom: 14,
        zoomControl: true,
      });

      leaflet.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20, subdomains: 'abcd',
        attribution: '&copy; CARTO',
      }).addTo(map);

      mapRef.current = map;

      // Add markers
      capsules.forEach((cap) => {
        const isRemoved = cap.moderation_status === 'removed';
        const isFlagged = cap.flag_count > 0;
        const isGhost = cap.visibility_layer === 'ghost';
        const isPrivate = cap.visibility_layer === 'private';
        const isLocked = cap.unlock_date && new Date(cap.unlock_date) > new Date();
        const hasMedia = !!cap.media_url;

        const color = isRemoved ? '#ff3366' : isFlagged ? '#ffaa00' : isLocked ? '#b44aff' : isGhost ? '#b44aff' : isPrivate ? '#00e5ff' : '#00ff88';
        const opacity = isRemoved ? 0.3 : 1;

        const icon = leaflet.divIcon({
          className: '',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
          html: `<div style="
            width:16px;height:16px;border-radius:50%;
            background:${color};opacity:${opacity};
            box-shadow:0 0 8px ${color};
            border:2px solid rgba(255,255,255,0.15);
          "></div>`,
        });

        const marker = leaflet.marker([cap.lat, cap.lng], { icon });

        marker.on('click', () => setSelected(cap));
        marker.addTo(map);
        markersRef.current.push(marker);
      });

      // Fit bounds if multiple capsules
      if (capsules.length > 1) {
        const bounds = leaflet.latLngBounds(capsules.map(c => [c.lat, c.lng]));
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    })();

    return () => {
      cancelled = true;
      try { mapRef.current?.remove(); mapRef.current = null; } catch (_) {}
    };
  }, [loading, capsules]);

  const deleteCapsule = async (id) => {
    if (!confirm('Deletar esta capsula permanentemente?')) return;
    await supabase.from('capsules').delete().eq('id', id);
    setCapsules(prev => prev.filter(c => c.id !== id));
    setSelected(null);
    // Remove marker from map
    // (simplified: just reload on next visit)
  };

  return (
    <div>
      <h1 style={st.h1}>mapa de capsulas</h1>

      {/* Stats */}
      <div style={st.statsRow}>
        <StatChip label="Total" value={stats.total} color="#c8c8e0" />
        <StatChip label="Public" value={stats.public} color="#00ff88" />
        <StatChip label="Ghost" value={stats.ghost} color="#b44aff" />
        <StatChip label="Private" value={stats.private} color="#00e5ff" />
        <StatChip label="Locked" value={stats.locked} color="#b44aff" />
        <StatChip label="Media" value={stats.withMedia} color="#ffaa00" />
        <StatChip label="Flagged" value={stats.flagged} color="#ff8844" />
        <StatChip label="Removed" value={stats.removed} color="#ff3366" />
      </div>

      {/* Legend */}
      <div style={st.legend}>
        <Dot color="#00ff88" label="Public" />
        <Dot color="#b44aff" label="Ghost/Locked" />
        <Dot color="#00e5ff" label="Private" />
        <Dot color="#ffaa00" label="Flagged" />
        <Dot color="#ff3366" label="Removed" />
      </div>

      {/* Map */}
      <div style={st.mapWrap}>
        <div ref={mapContainerRef} style={st.map} />
        {loading && <div style={st.loading}>carregando capsulas...</div>}
      </div>

      {/* Selected capsule detail panel */}
      {selected && (
        <div style={st.detail}>
          <div style={st.detailHeader}>
            <h3 style={st.detailTitle}>CAPSULA</h3>
            <button style={st.closeBtn} onClick={() => setSelected(null)}>x</button>
          </div>

          <div style={st.detailGrid}>
            <Field label="ID" value={selected.id.slice(0, 12) + '...'} />
            <Field label="Tipo" value={selected.visibility_layer} color={
              selected.visibility_layer === 'public' ? '#00ff88' : selected.visibility_layer === 'ghost' ? '#b44aff' : '#00e5ff'
            } />
            <Field label="Status" value={selected.moderation_status || 'active'} color={
              selected.moderation_status === 'removed' ? '#ff3366' : '#00e5ff'
            } />
            <Field label="Flags" value={selected.flag_count || 0} color={selected.flag_count > 0 ? '#ff8844' : '#55556a'} />
            <Field label="Views" value={selected.views_count || 0} />
            <Field label="Views left" value={selected.views_left ?? '∞'} />
            <Field label="Midia" value={selected.media_type || 'nenhuma'} />
            <Field label="Criado" value={selected.created_at ? new Date(selected.created_at).toLocaleString('pt-BR') : '---'} />
            <Field label="Autor" value={selected.created_by?.slice(0, 12) || 'anon'} />
            <Field label="GPS" value={`${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}`} />
          </div>

          {/* Content */}
          <div style={st.contentBox}>
            <div style={st.contentLabel}>CONTEUDO</div>
            <div style={st.contentBody}>
              {selected.content?.body || JSON.stringify(selected.content)}
            </div>
          </div>

          {/* Media preview */}
          {selected.media_url && (
            <div style={st.mediaBox}>
              {selected.media_type === 'image' && (
                <img src={selected.media_url} alt="media" style={st.mediaImg} />
              )}
              {selected.media_type === 'video' && (
                <video src={selected.media_url} controls playsInline style={st.mediaImg} />
              )}
              {selected.media_type === 'audio' && (
                <audio src={selected.media_url} controls style={{ width: '100%' }} />
              )}
            </div>
          )}

          {/* Actions */}
          <div style={st.actions}>
            <a href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`} target="_blank" rel="noopener" style={st.actionBtn}>
              Google Maps
            </a>
            <button style={{ ...st.actionBtn, ...st.dangerBtn }} onClick={() => deleteCapsule(selected.id)}>
              Deletar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={st.statChip}>
      <span style={{ ...st.statNum, color }}>{value}</span>
      <span style={st.statLabel}>{label}</span>
    </div>
  );
}

function Dot({ color, label }) {
  return (
    <span style={st.legendItem}>
      <span style={{ ...st.dot, background: color }} />
      {label}
    </span>
  );
}

function Field({ label, value, color }) {
  return (
    <div style={st.field}>
      <span style={st.fieldLabel}>{label}</span>
      <span style={{ ...st.fieldValue, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

const st = {
  h1: { margin: 0, marginBottom: 16, fontSize: '1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },

  statsRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 },
  statChip: { padding: '8px 14px', background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 },
  statNum: { fontSize: '1.1rem', fontWeight: 700 },
  statLabel: { fontSize: '0.48rem', color: '#55556a', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 },

  legend: { display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.6rem', color: '#8888a0' },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },

  mapWrap: { position: 'relative', height: 500, borderRadius: 10, overflow: 'hidden', border: '1px solid #1a1a30', marginBottom: 16 },
  map: { width: '100%', height: '100%' },
  loading: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0c0c1c', color: '#55556a' },

  detail: { padding: 18, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 10 },
  detailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailTitle: { margin: 0, fontSize: '0.7rem', letterSpacing: '0.2em', color: '#00e5ff', textTransform: 'uppercase' },
  closeBtn: { background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 4, color: '#8888a0', width: 28, height: 28, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' },

  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 2 },
  fieldLabel: { fontSize: '0.48rem', color: '#55556a', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 },
  fieldValue: { fontSize: '0.72rem', color: '#c8c8e0', fontFamily: 'ui-monospace, monospace' },

  contentBox: { padding: 12, background: '#05050f', borderRadius: 6, marginBottom: 12 },
  contentLabel: { fontSize: '0.48rem', color: '#55556a', letterSpacing: '0.15em', marginBottom: 6, fontWeight: 600 },
  contentBody: { fontSize: '0.78rem', color: '#e8e8f0', lineHeight: 1.6 },

  mediaBox: { marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: '1px solid #1a1a30' },
  mediaImg: { width: '100%', maxHeight: 300, objectFit: 'contain', background: '#000', display: 'block' },

  actions: { display: 'flex', gap: 8 },
  actionBtn: { padding: '8px 16px', background: '#1a1a30', border: '1px solid #2a2a40', borderRadius: 6, color: '#c8c8e0', fontSize: '0.68rem', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none' },
  dangerBtn: { background: '#2a0a10', borderColor: '#ff4466', color: '#ff4466' },
};
