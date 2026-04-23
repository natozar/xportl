/**
 * Share service — generates shareable links for private capsules.
 * The link encodes capsule ID + coordinates in a URL-safe base64 token.
 * No server-side endpoint needed — the app decodes the token client-side.
 */

const SHARE_PREFIX = '/app#capsule=';

/**
 * Encode capsule data into a shareable token
 */
export function generateShareLink(capsule) {
  const payload = {
    id: capsule.id,
    lat: capsule.lat,
    lng: capsule.lng,
  };
  const token = btoa(JSON.stringify(payload));
  return window.location.origin + SHARE_PREFIX + token;
}

/**
 * Decode a share token from the URL hash (hash form: `#capsule=<base64>`),
 * OR a plain capsule id from the query string (query form: `?capsule=<uuid>`).
 *
 * The query form is what `/p/:id` share previews generate — no lat/lng,
 * just the id. App.jsx fetches the capsule row by id and computes distance
 * opportunistically at open time, so lat/lng aren't actually required here.
 *
 * Returns { id, lat?, lng? } or null.
 */
export function decodeShareToken() {
  // 1) Hash token form — legacy share link with embedded coords.
  const hash = window.location.hash;
  if (hash.includes('capsule=')) {
    try {
      const token = hash.split('capsule=')[1];
      const payload = JSON.parse(atob(token));
      if (payload.id && payload.lat && payload.lng) return payload;
    } catch (_e) { /* fall through to query-param form */ }
  }

  // 2) Query-param form — lean preview CTA from /p/:id.
  const qs = new URLSearchParams(window.location.search);
  const qid = qs.get('capsule');
  // Basic UUID shape sanity check (don't trust crawlers).
  if (qid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(qid)) {
    return { id: qid };
  }

  return null;
}

/**
 * Share via native share API (mobile) or copy to clipboard (desktop)
 */
export async function shareCapsule(capsule) {
  const url = generateShareLink(capsule);
  const text = 'Descobri um portal escondido no XPortl. Venha desbloquear!';

  if (navigator.share) {
    try {
      await navigator.share({ title: 'XPortl — Portal secreto', text, url });
      return { method: 'native' };
    } catch (_) { /* user cancelled or not supported */ }
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url);
    return { method: 'clipboard' };
  } catch (_) {
    // Last resort: prompt
    window.prompt('Copie o link:', url);
    return { method: 'prompt' };
  }
}
