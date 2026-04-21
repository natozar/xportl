// Real-user web-vitals reporting.
//
// Each metric is fired at most once per page load by the web-vitals lib. We
// insert fire-and-forget into `web_vitals_events`. If Supabase is unreachable
// or the table doesn't exist yet (migration not applied), the error is
// swallowed — metrics must never crash the app or block rendering.
//
// Enable by calling reportWebVitals() once from the entry point after render.

import { supabase } from './supabase';

// Opaque per-tab session id so we can group metrics from the same visit.
function getSessionId() {
  try {
    const key = 'xportl_wv_session';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = (typeof window !== 'undefined' && window.crypto?.randomUUID)
        ? window.crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

function buildPayload(metric) {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    metric_name: metric.name,
    value: metric.value,
    rating: metric.rating,
    page_url: window.location.pathname + window.location.search,
    user_agent: navigator.userAgent,
    effective_type: conn?.effectiveType || null,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    device_memory: navigator.deviceMemory || null,
    hardware_concurrency: navigator.hardwareConcurrency || null,
    session_id: getSessionId(),
    build_id: import.meta.env.VITE_BUILD_ID || null,
    metadata: {
      // web-vitals attribution (largest element id, slowest phase, etc.)
      // We strip heavy DOM refs to avoid sending huge payloads.
      navigation_type: metric.navigationType,
      delta: metric.delta,
      id: metric.id,
    },
  };
}

function sendMetric(metric) {
  const payload = buildPayload(metric);
  // Log in dev for visibility
  if (import.meta.env.DEV) {
    console.log(`[XPortl Vitals] ${metric.name}=${metric.value.toFixed(2)} (${metric.rating})`);
  }
  supabase
    .from('web_vitals_events')
    .insert(payload)
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[XPortl Vitals] insert failed:', error.message);
      }
    })
    .catch(() => { /* offline / CORS / table missing — swallow */ });
}

export async function reportWebVitals() {
  // Dynamic import so web-vitals isn't in the critical path.
  try {
    const { onLCP, onCLS, onINP, onFCP, onTTFB } = await import('web-vitals');
    onLCP(sendMetric);
    onCLS(sendMetric);
    onINP(sendMetric);
    onFCP(sendMetric);
    onTTFB(sendMetric);
  } catch (e) {
    // web-vitals lib failed to load (very rare) — silent, non-fatal
    if (import.meta.env.DEV) console.warn('[XPortl Vitals] lib load failed:', e);
  }
}
