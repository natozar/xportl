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
import BottomNav from './components/BottomNav';
import MapView from './components/MapView';
import IndoorScene from './components/IndoorScene';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';
import { useGeolocation } from './hooks/useGeolocation';
import { useCamera } from './hooks/useCamera';
import { usePwaInstall } from './hooks/usePwaInstall';
import { createCapsule, getNearbyCapsules, subscribeToCapsuleChanges, haversineDistance } from './services/capsules';
import { createPing } from './services/pings';
import { clusterCapsules } from './services/clustering';
import { decodeShareToken } from './services/share';
import { uploadMedia } from './services/storage';
import { supabase } from './services/supabase';
import {
  getProfile, hasAcceptedTos, hasAcceptedLocationDisclaimer,
  acceptTos, acceptLocationDisclaimer, isAccountBlocked,
} from './services/auth';
import { validateContent, checkRateLimit, checkRestrictedZone, logAccess, getMinorRestrictions } from './services/moderation';
import { awardXP, updateStreak, tryGrantBadge } from './services/gamification';
import XPToast from './components/XPToast';
import Leaderboard from './components/Leaderboard';

// Polling is now just a safety net behind the realtime subscription — if the
// websocket drops or a change arrives while unfocused, the next poll catches
// it. 30s is plenty when realtime is doing the heavy lifting.
const SCAN_INTERVAL = 30_000;
const SCAN_RADIUS = 50;

// Offset planted capsules ~6m from the user in a random bearing so the AR
// entity doesn't render at distance zero (invisible, colocated with the
// camera). Multiple capsules planted at the same spot spread in a small
// circle around the user.
const PLANT_OFFSET_METERS = 1.5;
function offsetCoord(lat, lng) {
  const bearing = Math.random() * 2 * Math.PI;
  const dLat = (PLANT_OFFSET_METERS * Math.cos(bearing)) / 111320;
  const dLng =
    (PLANT_OFFSET_METERS * Math.sin(bearing)) /
    (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

function isCapsuleVisible(c) {
  return !c.moderation_status || c.moderation_status === 'active';
}

export default function App() {
  // ── Auth state ──
  const [session, setSession] = useState(undefined); // undefined=loading, null=no auth
  const [profile, setProfile] = useState(null);
  const [showTos, setShowTos] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [blocked, setBlocked] = useState(null);
  const [emailUnverified, setEmailUnverified] = useState(false);

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
  const [activeTab, setActiveTab] = useState('explore');
  const [showSettings, setShowSettings] = useState(false);
  const [xpEvent, setXpEvent] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
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

          // Check email verification (only for email/password signups — OAuth is always verified)
          const user = session.user;
          const isEmailAuth = user.app_metadata?.provider === 'email';
          if (isEmailAuth && !user.email_confirmed_at) {
            setEmailUnverified(true);
            return;
          }
          setEmailUnverified(false);

          if (!hasAcceptedTos(p)) { setShowTos(true); return; }
          if (!hasAcceptedLocationDisclaimer(p)) { setShowDisclaimer(true); return; }

          // Update daily streak on successful profile load
          updateStreak(session.user.id).catch(() => {});
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
    console.log('[XPortl Gate]', { permissionsGranted, legalGatesCleared, ready, geoGranted: geo.granted, camGranted: cam.granted, hasProfile: !!profile, showTos, showDisclaimer, blocked: !!blocked });
    if (permissionsGranted && legalGatesCleared && !ready) {
      console.log('[XPortl Gate] ALL CLEAR — mounting AR');
      setReady(true);
    }
  }, [permissionsGranted, legalGatesCleared, ready]);

  // ── Polling (safety net) ──
  useEffect(() => {
    if (!ready || geo.lat === null || geo.lng === null) return;
    let cancelled = false;

    const scan = async () => {
      try {
        const results = await getNearbyCapsules(geo.lat, geo.lng, SCAN_RADIUS);
        if (cancelled) return;
        setNearbyCapsules(results.filter(isCapsuleVisible));
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

  // ── Shared capsule link detection ──
  useEffect(() => {
    if (!ready) return;
    const shared = decodeShareToken();
    if (shared) {
      // Clean the hash so the token doesn't persist
      window.history.replaceState(null, '', window.location.pathname);
      // Fetch the capsule and open it
      (async () => {
        const { data } = await supabase.from('capsules').select('*').eq('id', shared.id).single();
        if (data) setSelectedCapsule({ ...data, distance_meters: 0 });
      })();
    }
  }, [ready]);

  // ── Realtime subscription ──
  // Merges new / updated / deleted capsules into state without waiting for
  // the next poll. Proximity + moderation filtering happens client-side since
  // postgres_changes doesn't support geo predicates.
  useEffect(() => {
    if (!ready || geo.lat === null || geo.lng === null) return;

    const lat = geo.lat;
    const lng = geo.lng;

    const unsubscribe = subscribeToCapsuleChanges({
      onInsert: (row) => {
        if (!isCapsuleVisible(row)) return;
        const distance = haversineDistance(lat, lng, row.lat, row.lng);
        if (distance > SCAN_RADIUS) return;
        setNearbyCapsules((prev) => {
          if (prev.some((c) => c.id === row.id)) return prev;
          return [...prev, { ...row, distance_meters: distance }]
            .sort((a, b) => a.distance_meters - b.distance_meters);
        });
        setLastScan(new Date().toLocaleTimeString('pt-BR'));
      },
      onUpdate: (row) => {
        setNearbyCapsules((prev) => {
          const idx = prev.findIndex((c) => c.id === row.id);
          // Row just entered the visible set (moderation flipped to active,
          // previously filtered out) — treat like an insert if in range.
          if (idx === -1) {
            if (!isCapsuleVisible(row)) return prev;
            const distance = haversineDistance(lat, lng, row.lat, row.lng);
            if (distance > SCAN_RADIUS) return prev;
            return [...prev, { ...row, distance_meters: distance }]
              .sort((a, b) => a.distance_meters - b.distance_meters);
          }
          // Row left the visible set (banned, removed, etc.)
          if (!isCapsuleVisible(row)) {
            return prev.filter((c) => c.id !== row.id);
          }
          // In-place update (views_left decrement, etc.)
          const next = prev.slice();
          next[idx] = { ...next[idx], ...row };
          return next;
        });
      },
      onDelete: (row) => {
        setNearbyCapsules((prev) => prev.filter((c) => c.id !== row.id));
      },
    });

    return unsubscribe;
  }, [ready, geo.lat, geo.lng]);

  // ── Leave Trace (with all compliance checks) ──
  const handleLeaveTrace = useCallback(async ({ unlockDate, message, mediaBlob, mediaType, viewsLeft, visibilityLayer }) => {
    if (saving || geo.lat === null || !session?.user?.id) return;

    const body = (message && message.trim()) || 'Estive aqui!';

    // Helper: run a check with a timeout so a broken RPC never freezes the app
    const safeCheck = (fn, fallback, timeoutMs = 5000) =>
      Promise.race([fn(), new Promise((r) => setTimeout(() => r(fallback), timeoutMs))]);

    // Rate limit check (fail-open on timeout)
    try {
      const rateCheck = await safeCheck(
        () => checkRateLimit(session.user.id, 'create_capsule'),
        { allowed: true }
      );
      if (!rateCheck.allowed) { alert(rateCheck.retryAfter); return; }
    } catch (e) { console.warn('[XPortl] Rate limit check failed, allowing:', e); }

    // Geofence check (fail-open on timeout)
    try {
      const zone = await safeCheck(
        () => checkRestrictedZone(geo.lat, geo.lng),
        null
      );
      if (zone) { alert(`Zona restrita (${zone.zone_name}). Capsulas nao podem ser criadas neste local.`); return; }
    } catch (e) { console.warn('[XPortl] Geofence check failed, allowing:', e); }

    // ECA: minor restrictions (local check, no network)
    const minorRules = getMinorRestrictions(profile);
    if (minorRules) {
      if (minorRules.noMedia && mediaBlob) { alert('Conta de menor: envio de midia nao permitido (ECA).'); return; }
      if (minorRules.noGhost && visibilityLayer === 'ghost') { alert('Conta de menor: capsulas Ghost nao permitidas (ECA).'); return; }
    }

    // Content validation (local check, no network)
    const contentCheck = validateContent(body);
    if (!contentCheck.allowed) { alert(contentCheck.reason); return; }

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

      const plant = offsetCoord(geo.lat, geo.lng);
      await createCapsule({
        lat: plant.lat,
        lng: plant.lng,
        altitude: geo.altitude,
        content: { type: 'text', body },
        visibility_layer: visibilityLayer || 'public',
        unlock_date: unlockDate,
        media_url: mediaUrl,
        media_type: mediaTypeField,
        views_left: viewsLeft,
        created_by: session.user.id,
      });

      // Log access (Marco Civil Art. 15) — fire-and-forget
      logAccess({ userId: session.user.id, action: 'create_capsule', lat: geo.lat, lng: geo.lng }).catch(() => {});

      // Award XP (non-blocking — capsule is already saved, don't let XP failure break the flow)
      try {
        const xpAction = visibilityLayer === 'ghost' ? 'create_ghost' : (mediaBlob ? 'create_media' : 'create_capsule');
        const xpResult = await awardXP(session.user.id, xpAction);
        if (xpResult) setXpEvent(xpResult);
        tryGrantBadge(session.user.id, 'first_portal').catch(() => {});
        if (unlockDate) tryGrantBadge(session.user.id, 'time_lord').catch(() => {});
        if (mediaBlob) tryGrantBadge(session.user.id, 'media_creator').catch(() => {});
      } catch (xpErr) {
        console.warn('[XPortl] XP award failed (capsule was saved):', xpErr);
      }

      scanVersion.current += 1;
      const results = await getNearbyCapsules(geo.lat, geo.lng, SCAN_RADIUS);
      setNearbyCapsules(results.filter((c) => !c.moderation_status || c.moderation_status === 'active'));
      setLastScan(new Date().toLocaleTimeString('pt-BR'));
    } catch (err) {
      const msg = err?.message || err?.error_description || JSON.stringify(err);
      console.error('[XPortl] Failed to create capsule:', msg, err);

      // Log to error_events for godmode visibility — include full context
      supabase.from('error_events').insert({
        source: 'client',
        user_id: session.user.id,
        url: window.location.href,
        user_agent: navigator.userAgent,
        error_name: 'CREATE_CAPSULE_FAILED',
        error_message: msg,
        error_stack: err?.stack || null,
        severity: 'error',
        metadata: {
          lat: geo.lat,
          lng: geo.lng,
          visibility_layer: visibilityLayer || 'public',
          has_media: !!mediaBlob,
          media_type: mediaType || null,
          has_unlock: !!unlockDate,
          error_code: err?.code || null,
          error_details: err?.details || null,
          error_hint: err?.hint || null,
          supabase_status: err?.status || null,
        },
      }).then(() => {}).catch(() => {});

      alert('Falha ao criar capsula:\n' + msg);
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
      // Award XP for discovering (only if not own capsule)
      if (capsule.created_by !== session.user.id) {
        awardXP(session.user.id, 'discover_capsule', capsule.id).then((r) => { if (r) setXpEvent(r); });
      }
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

  // 4. Email verification (email/password signups only)
  if (emailUnverified) {
    return (
      <div style={{ width: '100%', height: '100%', background: 'var(--bg-void)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16 }}>
          <rect x="2" y="4" width="20" height="16" rx="3" stroke="#00f0ff" strokeWidth="1.5" />
          <path d="M2 7l10 6 10-6" stroke="#00f0ff" strokeWidth="1.5" />
        </svg>
        <h2 style={{ color: '#00f0ff', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 8 }}>CONFIRME SEU E-MAIL</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', lineHeight: 1.6, maxWidth: 300 }}>
          Enviamos um link de verificacao para <strong style={{ color: '#00f0ff' }}>{session.user.email}</strong>. Abra seu e-mail e clique no link para ativar sua conta.
        </p>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.6rem', marginTop: 12 }}>Verifique tambem a pasta de spam.</p>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 20, padding: '10px 24px', borderRadius: 12, background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.15)', color: '#00f0ff', fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit' }}
        >
          Ja confirmei — recarregar
        </button>
      </div>
    );
  }

  // 5. ToS
  if (showTos) return <TosModal onAccept={handleAcceptTos} />;

  // 5. Location Disclaimer
  if (showDisclaimer) return <LocationDisclaimer onAccept={handleAcceptDisclaimer} />;

  // 6. Camera/GPS permissions
  if (!ready) return <PermissionGate geo={geo} cam={cam} onComplete={() => {
    console.log('[XPortl Gate] onComplete called from PermissionGate');
    setReady(true);
  }} />;

  // ── Tab handler (Create tab opens the creation panel via explore view) ──
  const handleTabChange = (tab) => {
    setShowSettings(false);
    if (tab === 'create') {
      setActiveTab('explore'); // Stay on AR view
      // The LeaveTraceButton will be triggered to open by a ref/callback
      window.dispatchEvent(new CustomEvent('xportl:open-create'));
    } else {
      setActiveTab(tab);
    }
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      const p = await getProfile(session.user.id);
      if (p) setProfile(p);
    }
  };

  // 7. Main app
  return (
    <div className="scanlines" style={styles.root}>
      {/* AR scene always mounted (camera stays live even on profile tab) */}
      <ARScene capsules={nearbyCapsules} pings={activePings} onCapsuleClick={handleCapsuleClick} onVortexClick={handleVortexClick} />

      {/* ── Tab: Explore (AR overlay) ── */}
      {activeTab === 'explore' && (
        <>
          {pwa.canInstall && (
            <InstallPrompt isIos={pwa.isIos} isAndroid={pwa.isAndroid} onInstall={pwa.install} onDismiss={pwa.dismiss} />
          )}

          <div style={styles.overlay}>
            <Radar lat={geo.lat} lng={geo.lng} altitude={geo.altitude} nearbyCount={nearbyCapsules.length} />
            <LeaveTraceButton onPress={handleLeaveTrace} saving={saving} />
            <VibePing onPing={handleVibePing} />
          </div>
        </>
      )}

      {/* ── Tab: Indoor (WebXR Spatial) ── */}
      {activeTab === 'indoor' && (
        <IndoorScene
          capsules={nearbyCapsules}
          onCapsuleFound={(cap) => { setActiveTab('explore'); setSelectedCapsule(cap); }}
          onClose={() => setActiveTab('explore')}
        />
      )}

      {/* ── Tab: Map ── */}
      {activeTab === 'map' && (
        <MapView
          lat={geo.lat}
          lng={geo.lng}
          capsules={nearbyCapsules}
          onSelectCapsule={(cap) => { setSelectedCapsule(cap); }}
        />
      )}

      {/* ── Tab: Profile ── */}
      {activeTab === 'profile' && !showSettings && (
        <ProfilePage
          session={session}
          profile={profile}
          onOpenSettings={() => setShowSettings(true)}
          onRefreshProfile={refreshProfile}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />
      )}

      {/* ── Settings (sub-page of profile) ── */}
      {showSettings && (
        <SettingsPage session={session} onBack={() => setShowSettings(false)} />
      )}

      {/* ── Bottom Navigation (always visible) ── */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* ── Modals (render on top of everything) ── */}
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

      {/* XP notification toast */}
      <XPToast event={xpEvent} onDone={() => setXpEvent(null)} />

      {/* Leaderboard modal */}
      {showLeaderboard && (
        <Leaderboard
          currentUserId={session.user.id}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
}

const styles = {
  root: { width: '100%', height: '100dvh', position: 'relative' },
  overlay: { position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999 },
};
