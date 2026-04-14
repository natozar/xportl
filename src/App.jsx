import React, { useState, useEffect, useCallback, useRef } from 'react';
import PermissionGate from './components/PermissionGate';
import ARScene from './components/ARScene';
import Radar from './components/Radar';
import LeaveTraceButton from './components/LeaveTraceButton';
import DebugPanel from './components/DebugPanel';
import CapsuleModal from './components/CapsuleModal';
import VortexModal from './components/VortexModal';
import VibePing from './components/VibePing';
import { useGeolocation } from './hooks/useGeolocation';
import { useCamera } from './hooks/useCamera';
import { createCapsule, getNearbyCapsules } from './services/capsules';
import { createPing } from './services/pings';
import { clusterCapsules } from './services/clustering';
import { uploadMedia } from './services/storage';

const SCAN_INTERVAL = 10_000;
const SCAN_RADIUS = 50;

export default function App() {
  const geo = useGeolocation();
  const cam = useCamera();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nearbyCapsules, setNearbyCapsules] = useState([]);
  const [lastScan, setLastScan] = useState(null);
  const [supabaseOk, setSupabaseOk] = useState(null);
  const [selectedCapsule, setSelectedCapsule] = useState(null);
  const [selectedVortex, setSelectedVortex] = useState(null);
  const [activePings, setActivePings] = useState([]);
  const scanVersion = useRef(0);

  const permissionsGranted = geo.granted && cam.granted;

  useEffect(() => {
    if (permissionsGranted) {
      cam.release();
      const t = setTimeout(() => setReady(true), 600);
      return () => clearTimeout(t);
    }
  }, [permissionsGranted]);

  // ── Polling ──
  useEffect(() => {
    if (geo.lat === null || geo.lng === null) return;
    let cancelled = false;

    const scan = async () => {
      try {
        const results = await getNearbyCapsules(geo.lat, geo.lng, SCAN_RADIUS);
        if (cancelled) return;
        setNearbyCapsules(results);
        setLastScan(new Date().toLocaleTimeString('pt-BR'));
        setSupabaseOk(true);
      } catch (err) {
        if (cancelled) return;
        console.error('[XPortl] Scan failed:', err);
        setSupabaseOk(false);
      }
    };

    scan();
    const interval = setInterval(scan, SCAN_INTERVAL);
    return () => { cancelled = true; clearInterval(interval); };
  }, [geo.lat, geo.lng, scanVersion.current]);

  // ── Leave Trace ──
  const handleLeaveTrace = useCallback(async ({ unlockDate, mediaBlob, mediaType, viewsLeft, visibilityLayer }) => {
    if (saving || geo.lat === null) return;

    setSaving(true);
    try {
      let mediaUrl = null;
      let mediaTypeField = null;

      if (mediaBlob && mediaType) {
        const result = await uploadMedia(mediaBlob, mediaType);
        mediaUrl = result.url;
        mediaTypeField = mediaType;
      }

      await createCapsule({
        lat: geo.lat,
        lng: geo.lng,
        altitude: geo.altitude,
        content: { type: 'text', body: 'Estive aqui!' },
        visibility_layer: visibilityLayer || 'public',
        unlock_date: unlockDate,
        media_url: mediaUrl,
        media_type: mediaTypeField,
        views_left: viewsLeft,
      });

      scanVersion.current += 1;
      const results = await getNearbyCapsules(geo.lat, geo.lng, SCAN_RADIUS);
      setNearbyCapsules(results);
      setLastScan(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.error('[XPortl] Failed to create capsule:', err);
    } finally {
      setSaving(false);
    }
  }, [geo.lat, geo.lng, geo.altitude, saving]);

  // ── Quick Ping (ephemeral emoji) ──
  const handleVibePing = useCallback(async (emoji) => {
    if (geo.lat === null) return;

    try {
      const ping = await createPing({ lat: geo.lat, lng: geo.lng, emoji });

      // Add to local active pings for AR rendering
      setActivePings((prev) => [...prev, ping]);

      // Auto-remove from local state after 15s
      setTimeout(() => {
        setActivePings((prev) => prev.filter((p) => p.id !== ping.id));
      }, 15500);
    } catch (err) {
      console.error('[XPortl] Ping failed:', err);
    }
  }, [geo.lat, geo.lng]);

  // ── Capsule click ──
  const handleCapsuleClick = useCallback((capsule) => {
    setSelectedCapsule(capsule);
  }, []);

  // ── Vortex click: find the vortex cluster and open timeline ──
  const handleVortexClick = useCallback((vortexId) => {
    const { vortexes } = clusterCapsules(nearbyCapsules.filter((c) => c.content?.type !== 'ping'));
    const vortex = vortexes.find((v) => v.id === vortexId);
    if (vortex) setSelectedVortex(vortex);
  }, [nearbyCapsules]);

  // ── Self-destruct ──
  const handleSelfDestruct = useCallback((capsuleId) => {
    setNearbyCapsules((prev) => prev.filter((c) => c.id !== capsuleId));
  }, []);

  if (!ready) {
    return <PermissionGate geo={geo} cam={cam} onComplete={() => setReady(true)} />;
  }

  return (
    <div className="scanlines" style={styles.root}>
      <ARScene
        capsules={nearbyCapsules}
        pings={activePings}
        onCapsuleClick={handleCapsuleClick}
        onVortexClick={handleVortexClick}
      />

      <div style={styles.overlay}>
        <Radar lat={geo.lat} lng={geo.lng} altitude={geo.altitude} nearbyCount={nearbyCapsules.length} />
        <DebugPanel geo={geo} nearbyCapsules={nearbyCapsules} lastScan={lastScan} supabaseOk={supabaseOk} />
        <LeaveTraceButton onPress={handleLeaveTrace} saving={saving} />
        <VibePing onPing={handleVibePing} />
      </div>

      <CapsuleModal
        capsule={selectedCapsule}
        onClose={() => setSelectedCapsule(null)}
        onSelfDestruct={handleSelfDestruct}
      />

      <VortexModal
        vortex={selectedVortex}
        onClose={() => setSelectedVortex(null)}
        onSelectCapsule={(cap) => { setSelectedVortex(null); setSelectedCapsule(cap); }}
      />
    </div>
  );
}

const styles = {
  root: { width: '100%', height: '100%', position: 'relative' },
  overlay: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30 },
};
