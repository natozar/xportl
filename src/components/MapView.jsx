import React, { useEffect, useRef, useState } from 'react';
import { isCapsuleLocked, isGhostCapsule } from '../services/capsules';

// Leaflet is loaded dynamically to avoid blocking initial bundle
let L = null;
let leafletLoaded = false;

async function loadLeaflet() {
  if (leafletLoaded) return L;
  const module = await import('leaflet');
  L = module.default || module;

  // Inject Leaflet CSS (only once)
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

// Custom SVG markers (no external images needed)
function createMarkerIcon(leaflet, capsule) {
  const locked = isCapsuleLocked(capsule);
  const ghost = isGhostCapsule(capsule);
  const color = locked ? '#b44aff' : ghost ? '#b44aff' : '#00f0ff';
  const glow = locked ? '180,74,255' : '0,240,255';

  return leaflet.divIcon({
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    html: `
      <div style="
        width:32px; height:32px; position:relative;
        display:flex; align-items:center; justify-content:center;
      ">
        <div style="
          position:absolute; inset:0; border-radius:50%;
          background:rgba(${glow},0.15);
          border:2px solid ${color};
          box-shadow:0 0 12px rgba(${glow},0.4);
          animation: pulse-ring 2s ease-out infinite;
        "></div>
        <div style="
          width:10px; height:10px; border-radius:50%;
          background:${color};
          box-shadow:0 0 8px ${color};
          position:relative; z-index:2;
        "></div>
      </div>
    `,
  });
}

function createUserIcon(leaflet) {
  return leaflet.divIcon({
    className: '',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `
      <div style="
        width:20px; height:20px; border-radius:50%;
        background:#00f0ff; border:3px solid #0d0a1a;
        box-shadow:0 0 12px rgba(0,240,255,0.6);
      "></div>
    `,
  });
}

export default function MapView({ lat, lng, capsules, onSelectCapsule }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [loading, setLoading] = useState(true);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      const leaflet = await loadLeaflet();
      if (cancelled || mapRef.current) return;

      const map = leaflet.map(mapContainerRef.current, {
        center: [lat || -23.55, lng || -46.63],
        zoom: 17,
        zoomControl: false,
        attributionControl: false,
      });

      // Dark tile layer (CartoDB dark matter — free, no API key)
      leaflet.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 20, subdomains: 'abcd' }
      ).addTo(map);

      // Zoom control bottom-right
      leaflet.control.zoom({ position: 'bottomright' }).addTo(map);

      // Attribution minimal
      leaflet.control.attribution({ position: 'bottomright', prefix: false })
        .addAttribution('&copy; <a href="https://carto.com">CARTO</a>')
        .addTo(map);

      mapRef.current = map;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
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

  // Sync capsule markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    (async () => {
      const leaflet = await loadLeaflet();

      // Clear old markers
      markersRef.current.forEach((m) => map.removeLayer(m));
      markersRef.current = [];

      // Add new markers
      capsules.forEach((cap) => {
        if (cap.content?.type === 'ping') return; // Skip ephemeral pings

        const marker = leaflet.marker([cap.lat, cap.lng], {
          icon: createMarkerIcon(leaflet, cap),
        });

        // Popup with capsule info
        const locked = isCapsuleLocked(cap);
        const dist = cap.distance_meters !== undefined ? `${cap.distance_meters.toFixed(0)}m` : '?';
        const popupHtml = `
          <div style="
            background:#13102a; color:#e8e8f0; padding:10px 14px;
            border-radius:10px; border:1px solid rgba(0,240,255,0.15);
            font-family:-apple-system,sans-serif; font-size:12px;
            min-width:140px; box-shadow:0 4px 20px rgba(0,0,0,0.5);
          ">
            <div style="font-weight:700; color:${locked ? '#b44aff' : '#00f0ff'}; font-size:11px; letter-spacing:0.1em; margin-bottom:4px;">
              ${locked ? 'TRANCADA' : 'PORTAL'}
            </div>
            <div style="color:#aaa; font-size:11px; margin-bottom:6px;">
              ${locked ? 'Trava temporal ativa' : (cap.content?.body?.slice(0, 40) || '...')}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="color:rgba(255,255,255,0.3); font-size:10px;">${dist}</span>
              <span style="color:#00f0ff; font-size:10px; font-weight:600; cursor:pointer;" id="map-open-${cap.id}">
                ${locked ? 'Ver' : 'Abrir'} →
              </span>
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml, {
          closeButton: false,
          className: 'xportl-popup',
          offset: [0, -10],
        });

        marker.on('popupopen', () => {
          const btn = document.getElementById(`map-open-${cap.id}`);
          if (btn) {
            btn.onclick = () => {
              map.closePopup();
              onSelectCapsule(cap);
            };
          }
        });

        marker.addTo(map);
        markersRef.current.push(marker);
      });

      // Draw 50m radius circle
      markersRef.current.push(
        leaflet.circle([lat || -23.55, lng || -46.63], {
          radius: 50,
          color: 'rgba(0,240,255,0.2)',
          fillColor: 'rgba(0,240,255,0.04)',
          fillOpacity: 1,
          weight: 1,
          dashArray: '6,4',
        }).addTo(map)
      );
    })();
  }, [capsules, lat, lng]);

  return (
    <div style={s.container}>
      <div ref={mapContainerRef} style={s.map} />

      {loading && (
        <div style={s.loading}>
          <div style={s.spinner} />
          <span style={s.loadingText}>Carregando mapa...</span>
        </div>
      )}

      {/* Header overlay */}
      <div style={s.header}>
        <span style={s.headerTitle}>MAPA DE PORTAIS</span>
        <span style={s.headerCount}>{capsules.filter((c) => c.content?.type !== 'ping').length} portais</span>
      </div>

      {/* Legend */}
      <div style={s.legend}>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#00f0ff' }} />
          <span>Aberto</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#b44aff' }} />
          <span>Trancado / Ghost</span>
        </div>
        <div style={s.legendItem}>
          <div style={{ ...s.legendDot, background: '#00f0ff', border: '2px solid #0d0a1a' }} />
          <span>Voce</span>
        </div>
      </div>
    </div>
  );
}

const s = {
  container: {
    position: 'fixed', inset: 0,
    zIndex: 50, pointerEvents: 'auto',
    background: '#0d0a1a',
    paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
  },
  map: {
    width: '100%', height: '100%',
  },
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
  loadingText: {
    fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em',
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 10px',
    background: 'linear-gradient(to bottom, rgba(13,10,26,0.9) 60%, transparent)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    pointerEvents: 'none',
  },
  headerTitle: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.2em', color: '#00f0ff',
  },
  headerCount: {
    fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)',
  },
  legend: {
    position: 'absolute', bottom: 'calc(70px + env(safe-area-inset-bottom, 0px))', left: 12,
    zIndex: 10, pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', gap: 5,
    padding: '8px 12px', borderRadius: 10,
    background: 'rgba(13,10,26,0.8)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.04)',
  },
  legendItem: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)',
  },
  legendDot: {
    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
  },
};
