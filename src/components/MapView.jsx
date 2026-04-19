import { useEffect, useRef, useState } from 'react';
import { isCapsuleLocked, isGhostCapsule, getRarity, getCapsuleType } from '../services/capsules';

let L = null;
let leafletLoaded = false;

async function loadLeaflet() {
  if (leafletLoaded) return L;
  const module = await import('leaflet');
  L = module.default || module;
  if (!document.getElementById('leaflet-css')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  leafletLoaded = true;
  return L;
}

// ── Filters ──
const FILTER_RARITY = ['all', 'rare', 'legendary', 'mythic'];
const FILTER_TYPE = ['all', 'echo', 'chain', 'challenge', 'collab', 'auction'];

function createMarkerIcon(leaflet, capsule) {
  const locked = isCapsuleLocked(capsule);
  const ghost = isGhostCapsule(capsule);
  const rarity = getRarity(capsule);
  const useRarityColor = rarity.key !== 'common';

  const color = useRarityColor ? rarity.color : locked ? '#b44aff' : ghost ? '#b44aff' : '#00f0ff';
  const size = useRarityColor ? Math.round(28 + (rarity.scale - 1) * 24) : 28;
  const glowSize = size + 12;
  const coreSize = Math.round(size * 0.35);

  // Mythic/legendary get animated pulse, others static
  const animate = rarity.key === 'mythic' || rarity.key === 'legendary';

  return leaflet.divIcon({
    className: '',
    iconSize: [glowSize, glowSize],
    iconAnchor: [glowSize / 2, glowSize / 2],
    html: `
      <div style="width:${glowSize}px;height:${glowSize}px;position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          position:absolute;inset:0;border-radius:50%;
          background:radial-gradient(circle, ${color}25 0%, transparent 70%);
          border:1.5px solid ${color}${useRarityColor ? '66' : '33'};
          ${animate ? 'animation:pulse-ring 2s ease-out infinite;' : ''}
        "></div>
        <div style="
          width:${coreSize}px;height:${coreSize}px;border-radius:50%;
          background:${color};box-shadow:0 0 ${useRarityColor ? 12 : 6}px ${color};
          position:relative;z-index:2;
        "></div>
        ${rarity.key !== 'common' ? `<div style="
          position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);
          font-size:8px;white-space:nowrap;color:${color};font-weight:700;
          text-shadow:0 0 4px rgba(0,0,0,0.8);letter-spacing:0.04em;
        ">${rarity.icon}</div>` : ''}
      </div>
    `,
  });
}

function createUserIcon(leaflet) {
  return leaflet.divIcon({
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="width:20px;height:20px;border-radius:50%;background:#00f0ff;border:3px solid #0d0a1a;box-shadow:0 0 12px rgba(0,240,255,0.6);"></div>`,
  });
}

export default function MapView({ lat, lng, capsules, onSelectCapsule, onStartHunt, currentUserId, activeHuntId }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const heatRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [filterRarity, setFilterRarity] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filter capsules
  const filtered = (capsules || []).filter((c) => {
    if (c.content?.type === 'ping') return false;
    if (filterRarity !== 'all' && (c.rarity || 'common') !== filterRarity) return false;
    if (filterType !== 'all' && (c.capsule_type || 'standard') !== filterType) return false;
    return true;
  });

  // Ghost capsules: show approximate zone, not exact position
  const visibleCapsules = filtered.map((c) => {
    if (isGhostCapsule(c)) {
      // Jitter position slightly so exact location is hidden
      const jitter = 0.0002; // ~22m randomness
      return {
        ...c,
        _displayLat: c.lat + (Math.random() - 0.5) * jitter,
        _displayLng: c.lng + (Math.random() - 0.5) * jitter,
        _isGhostBlurred: true,
      };
    }
    return { ...c, _displayLat: c.lat, _displayLng: c.lng };
  });

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const leaflet = await loadLeaflet();
      if (cancelled || mapRef.current) return;

      const map = leaflet.map(mapContainerRef.current, {
        center: [lat || -21.17, lng || -47.81],
        zoom: lat ? 17 : 12,
        zoomControl: false,
        attributionControl: false,
      });

      leaflet.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 20, subdomains: 'abcd' }
      ).addTo(map);

      leaflet.control.zoom({ position: 'bottomright' }).addTo(map);
      leaflet.control.attribution({ position: 'bottomright', prefix: false })
        .addAttribution('&copy; <a href="https://carto.com">CARTO</a>')
        .addTo(map);

      mapRef.current = map;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } } catch (_) { mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update user position
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat === null || lng === null) return;

    (async () => {
      const leaflet = await loadLeaflet();
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([lat, lng]);
      } else {
        userMarkerRef.current = leaflet.marker([lat, lng], {
          icon: createUserIcon(leaflet),
          zIndexOffset: 1000,
        }).addTo(map);
      }
      map.setView([lat, lng], map.getZoom(), { animate: true });
    })();
  }, [lat, lng]);

  // Sync markers + heat zones
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    (async () => {
      const leaflet = await loadLeaflet();

      // Clear old
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];
      heatRef.current.forEach((h) => map.removeLayer(h));
      heatRef.current = [];

      // ── Heat zones (density circles) ──
      // Group capsules into ~100m grid cells and draw glow circles
      const grid = {};
      const cellSize = 0.001; // ~111m
      capsules.forEach((c) => {
        if (c.content?.type === 'ping') return;
        const key = `${Math.round(c.lat / cellSize)}_${Math.round(c.lng / cellSize)}`;
        if (!grid[key]) grid[key] = { lat: 0, lng: 0, count: 0 };
        grid[key].lat += c.lat;
        grid[key].lng += c.lng;
        grid[key].count += 1;
      });

      Object.values(grid).forEach((cell) => {
        if (cell.count < 2) return; // Only show for clusters
        const cLat = cell.lat / cell.count;
        const cLng = cell.lng / cell.count;
        const intensity = Math.min(cell.count / 10, 1);
        const radius = 40 + cell.count * 8;

        const circle = leaflet.circle([cLat, cLng], {
          radius,
          color: 'transparent',
          fillColor: `rgba(0,240,255,${0.03 + intensity * 0.08})`,
          fillOpacity: 1,
          weight: 0,
          interactive: false,
        }).addTo(map);
        heatRef.current.push(circle);
      });

      // ── Scan radius ──
      if (lat && lng) {
        const scanCircle = leaflet.circle([lat, lng], {
          radius: 500,
          color: 'rgba(0,240,255,0.12)',
          fillColor: 'rgba(0,240,255,0.02)',
          fillOpacity: 1,
          weight: 1,
          dashArray: '8,6',
          interactive: false,
        }).addTo(map);
        heatRef.current.push(scanCircle);
      }

      // ── Capsule markers ──
      visibleCapsules.forEach((cap) => {
        const rarity = getRarity(cap);
        const cType = getCapsuleType(cap);
        const locked = isCapsuleLocked(cap);
        const ghost = cap._isGhostBlurred;

        const marker = leaflet.marker([cap._displayLat, cap._displayLng], {
          icon: createMarkerIcon(leaflet, cap),
          zIndexOffset: rarity.key === 'mythic' ? 500 : rarity.key === 'legendary' ? 300 : rarity.key === 'rare' ? 100 : 0,
        });

        // Popup: no content preview — just metadata to build curiosity
        const dist = cap.distance_meters !== undefined ? `${cap.distance_meters.toFixed(0)}m` : '?';
        const rarityBadge = rarity.key !== 'common'
          ? `<span style="color:${rarity.color};font-weight:700;font-size:10px;">${rarity.icon} ${rarity.label}</span>`
          : '';
        const typeBadge = cType.key !== 'standard'
          ? `<span style="color:rgba(255,255,255,0.4);font-size:10px;">${cType.icon} ${cType.label}</span>`
          : '';

        const isOwn = currentUserId && cap.created_by === currentUserId;
        const isHunting = activeHuntId === cap.id;
        const canHunt = !isOwn && !isHunting && onStartHunt;

        const huntHtml = canHunt
          ? `<button id="map-hunt-${cap.id}" style="
              background:linear-gradient(135deg, #00f0ff, #00c8d8);color:#0a0814;
              border:none;padding:6px 10px;border-radius:8px;font-weight:700;font-size:10px;
              letter-spacing:0.03em;cursor:pointer;display:flex;align-items:center;gap:4px;
              font-family:inherit;box-shadow:0 0 10px rgba(0,240,255,0.35);
            ">🎯 Caçar</button>`
          : isHunting
          ? `<span style="color:#00f0ff;font-size:10px;font-weight:700;">● caçando</span>`
          : isOwn
          ? `<span style="color:rgba(255,255,255,0.3);font-size:10px;">sua</span>`
          : '';

        const popupHtml = `
          <div style="
            background:rgba(14,11,24,0.95);color:#e8e8f0;padding:10px 14px;
            border-radius:12px;border:1px solid ${rarity.key !== 'common' ? rarity.color + '33' : 'rgba(0,240,255,0.12)'};
            backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
            font-family:-apple-system,sans-serif;font-size:12px;
            min-width:170px;box-shadow:0 4px 24px rgba(0,0,0,0.6);
          ">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
              ${rarityBadge}
              ${typeBadge}
              ${locked ? '<span style="color:#b44aff;font-size:10px;">🔒 Trancada</span>' : ''}
              ${ghost ? '<span style="color:#b44aff;font-size:10px;">👻 ~zona</span>' : ''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
              <span style="color:rgba(255,255,255,0.35);font-size:10px;">${dist}</span>
              <span style="color:rgba(0,240,255,0.7);font-size:10px;font-weight:600;cursor:pointer;" id="map-open-${cap.id}">
                Detalhes →
              </span>
            </div>
            <div style="display:flex;justify-content:center;">
              ${huntHtml}
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, { closeButton: false, className: 'xportl-popup', offset: [0, -10] });
        marker.on('popupopen', () => {
          const btn = document.getElementById(`map-open-${cap.id}`);
          if (btn) btn.onclick = () => { map.closePopup(); onSelectCapsule(cap); };
          const huntBtn = document.getElementById(`map-hunt-${cap.id}`);
          if (huntBtn) huntBtn.onclick = () => { map.closePopup(); onStartHunt?.(cap.id); };
        });

        marker.addTo(map);
        markersRef.current.push(marker);
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCapsules.length, filterRarity, filterType, lat, lng, activeHuntId]);

  const activeFilters = (filterRarity !== 'all' ? 1 : 0) + (filterType !== 'all' ? 1 : 0);

  return (
    <div style={s.container}>
      <div ref={mapContainerRef} style={s.map} />

      {loading && (
        <div style={s.loading}>
          <div style={s.spinner} />
          <span style={s.loadingText}>Carregando mapa...</span>
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <div>
          <span style={s.headerTitle}>RADAR</span>
          <span style={s.headerCount}>{filtered.length} portais</span>
        </div>
        <button
          style={{
            ...s.filterBtn,
            ...(activeFilters > 0 ? { borderColor: 'rgba(0,240,255,0.3)', color: '#00f0ff' } : {}),
          }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="11" y1="18" x2="13" y2="18" />
          </svg>
          {activeFilters > 0 && <span style={s.filterBadge}>{activeFilters}</span>}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div style={s.filterPanel}>
          <div style={s.filterSection}>
            <span style={s.filterLabel}>RARIDADE</span>
            <div style={s.filterRow}>
              {FILTER_RARITY.map((r) => (
                <button
                  key={r}
                  style={{
                    ...s.filterPill,
                    ...(filterRarity === r ? { background: 'rgba(0,240,255,0.1)', borderColor: 'rgba(0,240,255,0.3)', color: '#00f0ff' } : {}),
                  }}
                  onClick={() => setFilterRarity(r)}
                >
                  {r === 'all' ? 'Todas' : getRarity({ rarity: r }).icon + ' ' + getRarity({ rarity: r }).label}
                </button>
              ))}
            </div>
          </div>
          <div style={s.filterSection}>
            <span style={s.filterLabel}>TIPO</span>
            <div style={s.filterRow}>
              {FILTER_TYPE.map((t) => (
                <button
                  key={t}
                  style={{
                    ...s.filterPill,
                    ...(filterType === t ? { background: 'rgba(0,240,255,0.1)', borderColor: 'rgba(0,240,255,0.3)', color: '#00f0ff' } : {}),
                  }}
                  onClick={() => setFilterType(t)}
                >
                  {t === 'all' ? 'Todos' : getCapsuleType({ capsule_type: t }).icon + ' ' + getCapsuleType({ capsule_type: t }).label}
                </button>
              ))}
            </div>
          </div>
          {activeFilters > 0 && (
            <button style={s.clearFilters} onClick={() => { setFilterRarity('all'); setFilterType('all'); }}>
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={s.legend}>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#00f0ff' }} />
          <span>Comum</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#3b82f6' }} />
          <span>Rara</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#f59e0b' }} />
          <span>Lendaria</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#ec4899' }} />
          <span>Mitica</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: 'rgba(0,240,255,0.15)', border: '1px dashed rgba(0,240,255,0.3)' }} />
          <span>Zona quente</span>
        </div>
      </div>
    </div>
  );
}

const s = {
  container: {
    position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'auto',
    background: '#0d0a1a',
    paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
  },
  map: { width: '100%', height: '100%' },
  loading: {
    position: 'absolute', inset: 0, zIndex: 10,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 12, background: '#0d0a1a',
  },
  spinner: {
    width: 24, height: 24, borderRadius: '50%',
    border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 10px',
    background: 'linear-gradient(to bottom, rgba(13,10,26,0.92) 60%, transparent)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  headerTitle: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', color: '#00f0ff',
    marginRight: 8,
  },
  headerCount: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' },
  filterBtn: {
    display: 'flex', alignItems: 'center', gap: 4, position: 'relative',
    padding: '6px 12px', borderRadius: 10,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 600, fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  filterBadge: {
    position: 'absolute', top: -4, right: -4,
    width: 16, height: 16, borderRadius: '50%', fontSize: '0.5rem',
    background: '#00f0ff', color: '#0a0814', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  filterPanel: {
    position: 'absolute', top: 'calc(52px + env(safe-area-inset-top, 0px))', left: 10, right: 10,
    zIndex: 10, padding: '12px 14px', borderRadius: 14,
    background: 'rgba(14,11,24,0.95)', backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  },
  filterSection: { marginBottom: 10 },
  filterLabel: {
    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.2)', marginBottom: 6, display: 'block',
  },
  filterRow: { display: 'flex', flexWrap: 'wrap', gap: 4 },
  filterPill: {
    padding: '5px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.4)', fontSize: '0.55rem', fontWeight: 600, fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    transition: 'all 0.15s',
  },
  clearFilters: {
    width: '100%', padding: '8px', borderRadius: 8, marginTop: 4,
    background: 'none', border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.3)', fontSize: '0.55rem', fontWeight: 600, fontFamily: 'inherit',
    touchAction: 'manipulation',
  },
  legend: {
    position: 'absolute', bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))', left: 10,
    zIndex: 10, pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', gap: 4,
    padding: '8px 12px', borderRadius: 10,
    background: 'rgba(13,10,26,0.85)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)',
  },
  legendDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
};
