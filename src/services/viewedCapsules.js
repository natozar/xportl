// Tracks which capsules the user has already opened.
// Persists in localStorage with a 30-day TTL per entry.
// Used to filter out already-seen capsules from huntable list.

const KEY = 'xportl_viewed_capsules';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    // Quota or privacy mode — silently ignore
  }
}

function prune(obj) {
  const now = Date.now();
  const out = {};
  for (const [id, ts] of Object.entries(obj)) {
    if (now - ts < TTL_MS) out[id] = ts;
  }
  return out;
}

export function markViewed(capsuleId) {
  if (!capsuleId) return;
  const obj = prune(load());
  obj[capsuleId] = Date.now();
  save(obj);
}

export function isViewed(capsuleId) {
  if (!capsuleId) return false;
  const obj = load();
  const ts = obj[capsuleId];
  if (!ts) return false;
  if (Date.now() - ts > TTL_MS) return false;
  return true;
}

export function getViewedIds() {
  return new Set(Object.keys(prune(load())));
}
