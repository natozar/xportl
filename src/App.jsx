import React, { useState, useEffect, useCallback, useRef } from 'react';
import AuthGate from './components/AuthGate';
import TosModal from './components/TosModal';
import LocationDisclaimer from './components/LocationDisclaimer';
import PermissionGate from './components/PermissionGate';
import ARScene from './components/ARScene';
import Radar from './components/Radar';
import LeaveTraceButton from './components/LeaveTraceButton';
import DebugPanel from './components/DebugPanel';
import CapsuleModal from './components/CapsuleModal';
import VortexModal from './components/VortexModal';
import VibePing from './components/VibePing';
import ReportModal from './components/ReportModal';
import InstallPrompt from './components/InstallPrompt';
import { useGeolocation } from './hooks/useGeolocation';
import { useCamera } from './hooks/useCamera';
import { usePwaInstall } from './hooks/usePwaInstall';
import { createCapsule, getNearbyCapsules } from './services/capsules';
import { createPing } from './services/pings';
import { clusterCapsules } from './services/clustering';
import { uploadMedia } from './services/storage';
import { supabase } from './services/supabase';
import {
  getProfile, hasAcceptedTos, hasAcceptedLocationDisclaimer,
  acceptTos, acceptLocationDisclaimer, isAccountBlocked,
} from './services/auth';
import { validateContent, checkRateLimit, checkRestrictedZone, logAccess } from './services/moderation';

const SCAN_INTERVAL = 10_000;
const SCAN_RADIUS = 50;

export default function App() {
  // ── Auth state ──
  const [session, setSession] = useState(undefined); // undefined=loading, null=no auth
  const [profile, setProfile] = useState(null);
  const [showTos, setShowTos] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [blocked, setBlocked] = useState(null);

  // ── PWA install ──
  const pwa = usePwaInstall();

  // ── App state ──
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
  const [reportTarget, setReportTarget] = useState(null);
  const scanVersion = useRef(0);

  // ── Auth listener ──
  useEffect(() => {
    let resolved = false;

    // Step 1: Subscribe to auth changes.
    // onAuthStateChange fires INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[XPortl Auth] Event:', event, '| User:', s?.user?.email ?? 'none', '| Hash in URL:', window.location.hash.includes('access_token'));

      resolved = true;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setProfile(null);
        setBlocked(null);
        setShowTos(false);
        setShowDisclaimer(false);
        setReady(false);
        return;
      }

      // For INITIAL_SESSION: s can be null if no stored session AND no hash tokens.
      // For SIGNED_IN / TOKEN_REFRESHED: s is always the valid session.
      setSession(s);
    });

    // Step 2: Fallback — if INITIAL_SESSION fires with null but there ARE hash tokens,
    // the Supabase client might still be processing them. Poll getSession() briefly.
    const hasHashTokens = window.location.hash.includes('access_token');

    if (hasHashTokens) {
      console.log('[XPortl Auth] OAuth hash tokens detected, waiting for processing...');
      // Give Supabase time to process the hash and fire SIGNED_IN
      const pollInterval = setInterval(async () => {
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s) {
          console.log('[XPortl Auth] Session recovered from hash:', s.user.email);
          setSession(s);
          clearInterval(pollInterval);
          // Clean hash from URL
          window.history.replaceState(null, '', window.location.pathname);
        }
      }, 500);

      // Stop polling after 5s
      setTimeout(() => clearInterval(pollInterval), 5000);
    }

    // Step 3: Safety net — never stay on loading screen forever
    const timeout = setTimeout(() => {
      if (!resolved) {
        console.warn('[XPortl Auth] No auth event after 4s, checking session directly...');
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          console.log('[XPortl Auth] Direct session check:', s?.user?.email ?? 'none');
          setSession(s ?? null);
        });
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // ── Load profile when session changes (with retry for new OAuth users) ──
  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      setBlocked(null);
      return;
    }

    let cancelled = false;

    const loadProfile = async (retries = 3) => {
      for (let i = 0; i < retries; i++) {
        const p = await getProfile(session.user.id);

        if (cancelled) return;

        if (p) {
          setProfile(p);

          const blockStatus = isAccountBlocked(p);
          if (blockStatus) { setBlocked(blockStatus); return; }

          if (!hasAcceptedTos(p)) { setShowTos(true); return; }
          if (!hasAcceptedLocationDisclaimer(p)) { setShowDisclaimer(true); return; }
          return;
        }

        // Profile might not exist yet (trigger hasn't fired for new OAuth user).
        // Wait and retry.
        console.log(`[XPortl Auth] Profile not found, retry ${i + 1}/${retries}...`);
        await new Promise((r) => setTimeout(r, 1000));
      }

      // After retries, still no profile — the trigger may have failed.
      // Set a minimal profile so the app doesn't hang.
      if (!cancelled) {
        console.warn('[XPortl Auth] Profile not found after retries, proceeding with defaults');
        setProfile({ id: session.user.id, account_status: 'active' });
        setShowTos(true);
      }
    };

    loadProfile();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // ── Handle ToS acceptance ──
  const handleAcceptTos = async () => {
    await acceptTos(session.user.id);
    setShowTos(false);
    const p = await getProfile(session.user.id);
    setProfile(p);
    if (!hasAcceptedLocationDisclaimer(p)) setShowDisclaimer(true);
  };

  // ── Handle disclaimer acceptance ──
  const handleAcceptDisclaimer = async () => {
    await acceptLocationDisclaimer(session.user.id);
    setShowDisclaimer(false);
    setProfile(await getProfile(session.user.id));
  };

  // ── Permissions ──
  const permissionsGranted = geo.granted && cam.granted;
  const legalGatesCleared = session && profile && !showTos && !showDisclaimer && !blocked
    && hasAcceptedTos(profile) && hasAcceptedLocationDisclaimer(profile);

  useEffect(() => {
    if (permissionsGranted && legalGatesCleared) {
      cam.release();
      const t = setTimeout(() => setReady(true), 600);
      return () => clearTimeout(t);
    }
  }, [permissionsGranted, legalGatesCleared]);

  // ── Polling ──
  useEffect(() => {
    if (!ready || geo.lat === null || geo.lng === null) return;
    let cancelled = false;

    const scan = async () => {
      try {
        const results = await getNearbyCapsules(geo.lat, geo.lng, SCAN_RADIUS);
        if (cancelled) return;
        // Filter out removed/under_review capsules
        setNearbyCapsules(results.filter((c) => !c.moderation_status || c.moderation_status === 'active'));
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
  }, [ready, geo.lat, geo.lng, scanVersion.current]);

  // ── Leave Trace (with all compliance checks) ──
  const handleLeaveTrace = useCallback(async ({ unlockDate, mediaBlob, mediaType, viewsLeft, visibilityLayer }) => {
    if (saving || geo.lat === null || !session?.user?.id) return;

    // Rate limit check
    const rateCheck = await checkRateLimit(session.user.id, 'create_capsule');
    if (!rateCheck.allowed) {
      alert(rateCheck.retryAfter);
      return;
    }

    // Geofence check
    const zone = await checkRestrictedZone(geo.lat, geo.lng);
    if (zone) {
      alert(`Zona restrita (${zone.zone_name}). Capsulas nao podem ser criadas neste local.`);
      return;
    }

    // Content validation
    const contentCheck = validateContent('Estive aqui!');
    if (!contentCheck.allowed) {
      alert(contentCheck.reason);
      return;
    }

    setSaving(true);
    try {
      let mediaUrl = null;
      let mediaTypeField = null;

      if (mediaBlob && mediaType) {
        const mediaRate = await checkRateLimit(session.user.id, 'upload_media');
        if (!mediaRate.allowed) { alert(mediaRate.retryAfter); setSaving(false); return; }
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
        created_by: session.user.id,
      });

      // Log access (Marco Civil Art. 15)
      logAccess({
        userId: session.user.id,
        action: 'create_capsule',
        lat: geo.lat,
        lng: geo.lng,
      });

      scanVersion.current += 1;
      const results = await getNearbyCapsules(geo.lat, geo.lng, SCAN_RADIUS);
      setNearbyCapsules(results.filter((c) => !c.moderation_status || c.moderation_status === 'active'));
      setLastScan(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      console.error('[XPortl] Failed to create capsule:', err);
    } finally {
      setSaving(false);
    }
  }, [geo.lat, geo.lng, geo.altitude, saving, session]);

  // ── Quick Ping ──
  const handleVibePing = useCallback(async (emoji) => {
    if (geo.lat === null || !session?.user?.id) return;
    const rateCheck = await checkRateLimit(session.user.id, 'create_ping');
    if (!rateCheck.allowed) return;

    try {
      const ping = await createPing({ lat: geo.lat, lng: geo.lng, emoji });
      setActivePings((prev) => [...prev, ping]);
      setTimeout(() => setActivePings((prev) => prev.filter((p) => p.id !== ping.id)), 15500);
    } catch (err) {
      console.error('[XPortl] Ping failed:', err);
    }
  }, [geo.lat, geo.lng, session]);

  // ── Capsule click ──
  const handleCapsuleClick = useCallback((capsule) => {
    setSelectedCapsule(capsule);
    if (session?.user?.id) {
      logAccess({ userId: session.user.id, action: 'view_capsule', targetId: capsule.id, lat: geo.lat, lng: geo.lng });
    }
  }, [session, geo.lat, geo.lng]);

  const handleVortexClick = useCallback((vortexId) => {
    const { vortexes } = clusterCapsules(nearbyCapsules.filter((c) => c.content?.type !== 'ping'));
    const vortex = vortexes.find((v) => v.id === vortexId);
    if (vortex) setSelectedVortex(vortex);
  }, [nearbyCapsules]);

  const handleSelfDestruct = useCallback((capsuleId) => {
    setNearbyCapsules((prev) => prev.filter((c) => c.id !== capsuleId));
  }, []);

  const handleReport = useCallback((capsule) => {
    setSelectedCapsule(null);
    setReportTarget({ type: 'capsule', id: capsule.id });
  }, []);

  // ── Render gates in order ──

  // 1. Loading (auth resolving — never show login prematurely)
  if (session === undefined) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg-void)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', border: '2px solid var(--neon-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 25px rgba(0,240,255,0.3)', marginBottom: 16 }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--neon-cyan)' }}>X</span>
        </div>
        <div style={{ width: 20, height: 20, border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  // 2. Auth
  if (!session) {
    return <AuthGate />;
  }

  // 3. Blocked account
  if (blocked) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <div>
          <h2 style={{ color: 'var(--danger)', fontSize: '1rem', marginBottom: 8 }}>Conta bloqueada</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{blocked.reason}</p>
        </div>
      </div>
    );
  }

  // 4. ToS
  if (showTos) return <TosModal onAccept={handleAcceptTos} />;

  // 5. Location Disclaimer
  if (showDisclaimer) return <LocationDisclaimer onAccept={handleAcceptDisclaimer} />;

  // 6. Camera/GPS permissions
  if (!ready) return <PermissionGate geo={geo} cam={cam} onComplete={() => setReady(true)} />;

  // 7. Main app
  return (
    <div className="scanlines" style={styles.root}>
      <ARScene capsules={nearbyCapsules} pings={activePings} onCapsuleClick={handleCapsuleClick} onVortexClick={handleVortexClick} />

      {/* PWA Install Prompt (non-blocking overlay) */}
      {pwa.canInstall && (
        <InstallPrompt
          isIos={pwa.isIos}
          isAndroid={pwa.isAndroid}
          onInstall={pwa.install}
          onDismiss={pwa.dismiss}
        />
      )}

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
        onReport={handleReport}
      />

      <VortexModal
        vortex={selectedVortex}
        onClose={() => setSelectedVortex(null)}
        onSelectCapsule={(cap) => { setSelectedVortex(null); setSelectedCapsule(cap); }}
      />

      {reportTarget && (
        <ReportModal
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          reporterId={session.user.id}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}

const styles = {
  root: { width: '100%', height: '100%', position: 'relative' },
  overlay: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 30 },
};
