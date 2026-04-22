// Product analytics — user_events table.
//
// Fire-and-forget. Never throws, never blocks the UI. Mirrors the same
// pattern used by error_events and web_vitals_events so telemetry is
// uniform across the client.
//
// Schema reference: migration_014_user_events.sql

import { supabase } from './supabase';

// Opaque per-tab session id — groups events from the same visit without
// exposing anything sensitive. Rebuilds on each cold load.
let SESSION_ID = null;
function getSessionId() {
  if (SESSION_ID) return SESSION_ID;
  try {
    const existing = sessionStorage.getItem('xportl_session_id');
    if (existing) { SESSION_ID = existing; return SESSION_ID; }
  } catch { /* storage blocked */ }
  SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  try { sessionStorage.setItem('xportl_session_id', SESSION_ID); } catch { /* noop */ }
  return SESSION_ID;
}

// In-memory de-dupe for high-frequency events (e.g. app_open on every
// render). We only ship one per event_name per session.
const ONCE_PER_SESSION = new Set([
  'app_open',
  'profile_viewed',
  'my_capsules_opened',
]);
const firedOnce = new Set();

/**
 * Track a product event.
 *
 * @param {string} name - event_name (snake_case)
 * @param {object} [properties] - anything serializable; keep PII out.
 */
export function trackEvent(name, properties = {}) {
  if (!name) return;
  if (ONCE_PER_SESSION.has(name)) {
    if (firedOnce.has(name)) return;
    firedOnce.add(name);
  }

  const sid = getSessionId();
  const build = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : null;

  // Pull user id if already resolved — but don't await it. The row just
  // goes in with user_id null if the lookup isn't ready; that's fine for
  // funnel analysis since session_id still ties events together.
  supabase.auth.getSession().then(({ data }) => {
    const uid = data?.session?.user?.id || null;
    supabase.from('user_events').insert({
      event_name: name,
      user_id: uid,
      session_id: sid,
      page: typeof window !== 'undefined' ? window.location.pathname : null,
      properties,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 240) : null,
      build_id: build,
    }).then(() => { /* fire-and-forget */ }, () => { /* swallow — telemetry must never break UX */ });
  }).catch(() => { /* supabase unavailable — swallow */ });
}
