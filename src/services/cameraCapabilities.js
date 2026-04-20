/**
 * cameraCapabilities — squeezes the most out of the user's own device.
 *
 * - pickBestBackCameraId(): of all back cameras, choose the MAIN wide lens
 *   (not telephoto, not ultrawide macro). Heuristic uses labels +
 *   getCapabilities().focalLength when available.
 * - applyAdvancedTrackConstraints(track): turn on continuous autofocus,
 *   continuous exposure, continuous white balance, broadest zoom range.
 * - supportsTorch(track) / setTorch(track, on): hardware flashlight.
 * - tapToFocus(track, x, y): set point-of-interest for focus + exposure.
 * - adaptiveVideoBitrate(): downshift on slow connections / saveData.
 *
 * All methods are best-effort. Missing capability = no-op, never throws.
 */

const LENS_HINTS = {
  // Order matters: tested first wins. Telephoto and macro are LAST so the
  // main wide camera is preferred for both AR and capture.
  prefer: [
    /\b(back|rear|environment)\b.*\b(wide|main|primary|0)\b/i,
    /\b(back|rear|environment)\b(?!.*(tele|zoom|ultra|macro|depth|tof|monochrome|infrared))/i,
    /\b(back|rear|environment)\b/i,
  ],
  avoid: [/tele|zoom|ultra|macro|depth|tof|monochrome|mono|infrared|ir/i],
};

/** List back cameras only (best-effort — labels require granted permission). */
export async function listBackCameras() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput' && !/\bfront\b|user|selfie/i.test(d.label || ''));
  } catch {
    return [];
  }
}

/**
 * Pick the deviceId of the main wide back camera. Returns null if we can't
 * tell — caller should fall back to facingMode: 'environment'.
 */
export async function pickBestBackCameraId() {
  const cams = await listBackCameras();
  if (cams.length === 0) return null;
  if (cams.length === 1) return cams[0].deviceId || null;

  // Score: positive for "wide/main", negative for tele/macro/depth.
  const scored = cams.map((cam) => {
    const label = cam.label || '';
    let score = 0;
    if (LENS_HINTS.prefer[0].test(label)) score += 3;
    else if (LENS_HINTS.prefer[1].test(label)) score += 2;
    else if (LENS_HINTS.prefer[2].test(label)) score += 1;
    if (LENS_HINTS.avoid.test(label)) score -= 5;
    return { cam, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].cam.deviceId || null;
}

/**
 * After getUserMedia hands you a track, push every advanced setting the
 * device exposes. Continuous AF + AE + AWB beats fixed values for AR and
 * for capture in changing lighting.
 */
export async function applyAdvancedTrackConstraints(track) {
  if (!track || typeof track.applyConstraints !== 'function') return false;
  let caps = {};
  try { caps = track.getCapabilities?.() || {}; } catch { caps = {}; }

  const advanced = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
  if (caps.whiteBalanceMode?.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
  // Disable digital zoom — we want the optical sensor, not a crop.
  if (caps.zoom && typeof caps.zoom.min === 'number') {
    advanced.push({ zoom: caps.zoom.min });
  }

  if (advanced.length === 0) return false;
  try {
    await track.applyConstraints({ advanced });
    return true;
  } catch (err) {
    console.debug('[XPortl] applyAdvancedTrackConstraints failed:', err?.name || err);
    return false;
  }
}

export function supportsTorch(track) {
  if (!track?.getCapabilities) return false;
  try { return !!track.getCapabilities().torch; } catch { return false; }
}

export async function setTorch(track, on) {
  if (!supportsTorch(track)) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: !!on }] });
    return true;
  } catch (err) {
    console.debug('[XPortl] setTorch failed:', err?.name || err);
    return false;
  }
}

/**
 * Set focus + exposure point-of-interest. Coords are normalized 0..1
 * (top-left origin) in the rendered video frame.
 * No-op when the device doesn't expose pointsOfInterest.
 */
export async function tapToFocus(track, x, y) {
  if (!track?.applyConstraints) return false;
  let caps = {};
  try { caps = track.getCapabilities?.() || {}; } catch { caps = {}; }
  const advanced = [];
  if (caps.pointsOfInterest) {
    advanced.push({ pointsOfInterest: [{ x, y }] });
  }
  // Re-trigger single-shot AF/AE if available, then settle into continuous.
  if (caps.focusMode?.includes('single-shot')) {
    advanced.push({ focusMode: 'single-shot' });
  }
  if (caps.exposureMode?.includes('single-shot')) {
    advanced.push({ exposureMode: 'single-shot' });
  }
  if (advanced.length === 0) return false;
  try {
    await track.applyConstraints({ advanced });
    // Drop back to continuous after a beat.
    setTimeout(() => {
      applyAdvancedTrackConstraints(track).catch(() => {});
    }, 1500);
    return true;
  } catch (err) {
    console.debug('[XPortl] tapToFocus failed:', err?.name || err);
    return false;
  }
}

/**
 * Pick a video bitrate that won't bury a slow connection or drain a phone
 * in saveData mode. Falls back to 4 Mbps when navigator.connection is
 * unavailable (desktop, older iOS).
 */
export function adaptiveVideoBitrate(defaultBps = 4_000_000) {
  const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!conn) return defaultBps;
  if (conn.saveData) return 600_000;
  switch (conn.effectiveType) {
    case 'slow-2g':
    case '2g': return 350_000;
    case '3g': return 1_200_000;
    case '4g': return defaultBps;
    default:   return defaultBps;
  }
}

/**
 * One-shot device profile, useful for telemetry / GodMode debugging.
 * Does NOT request permissions, just inspects what's already exposed.
 */
export function inspectDevice() {
  const n = typeof navigator !== 'undefined' ? navigator : {};
  return {
    cores: n.hardwareConcurrency || null,
    memoryGB: n.deviceMemory || null,
    dpr: typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : null,
    connection: n.connection
      ? { type: n.connection.effectiveType, downlink: n.connection.downlink, saveData: !!n.connection.saveData }
      : null,
    platform: n.userAgentData?.platform || n.platform || null,
    mobile: n.userAgentData?.mobile ?? null,
  };
}

/**
 * Resolution tiers, ordered from best to worst. acquireBestStream() walks
 * this list, so a flagship gets 4K and a low-end Android falls through to
 * 720p without throwing OverconstrainedError.
 */
const RES_TIERS = [
  { width: 3840, height: 2160, label: '4K UHD' },
  { width: 2560, height: 1440, label: '1440p' },
  { width: 1920, height: 1080, label: '1080p' },
  { width: 1280, height: 720,  label: '720p'  },
  { width: 640,  height: 480,  label: '480p'  },
];

/**
 * Pick the starting tier based on device capabilities. Saves a couple of
 * failed getUserMedia attempts on phones we already know can't do 4K.
 *  - <=2 GB RAM or <=4 cores → start at 1080p
 *  - Save-data mode → start at 720p
 *  - everything else → 4K
 */
function startTierIndex() {
  const d = inspectDevice();
  if (d.connection?.saveData) return 3;     // 720p
  if ((d.memoryGB && d.memoryGB <= 2) || (d.cores && d.cores <= 4)) return 2; // 1080p
  return 0; // 4K
}

/**
 * Get the best stream the device can deliver, walking the tier list
 * until one negotiates. Always tries with the pinned best lens first;
 * if that fails (OverconstrainedError on a fragile driver), falls back
 * to facingMode.
 *
 * Returns { stream, settings, tier } or throws on full failure.
 */
export async function acquireBestStream({ facingMode = 'environment', preferLensId = null } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia not supported');
  }

  const lensId = preferLensId ?? (facingMode === 'environment' ? await pickBestBackCameraId().catch(() => null) : null);
  const start = startTierIndex();

  const attempts = [];
  for (let i = start; i < RES_TIERS.length; i++) {
    const t = RES_TIERS[i];
    // Try with pinned lens first, then with facingMode as a fallback at
    // the same tier before stepping down. This handles Android drivers
    // that accept facingMode but reject deviceId pins on some lenses.
    const variants = lensId
      ? [
          { deviceId: { exact: lensId }, width: { ideal: t.width }, height: { ideal: t.height }, frameRate: { ideal: 30, max: 60 }, resizeMode: 'none' },
          { facingMode, width: { ideal: t.width }, height: { ideal: t.height }, frameRate: { ideal: 30, max: 60 } },
        ]
      : [
          { facingMode, width: { ideal: t.width }, height: { ideal: t.height }, frameRate: { ideal: 30, max: 60 } },
        ];

    for (const video of variants) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
        return { stream, settings, tier: t };
      } catch (err) {
        attempts.push({ tier: t.label, name: err?.name, msg: err?.message });
      }
    }
  }

  // Last-ditch: minimum constraints, any camera.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: false });
    const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
    return { stream, settings, tier: { label: 'minimum', width: settings.width, height: settings.height } };
  } catch (err) {
    attempts.push({ tier: 'minimum', name: err?.name, msg: err?.message });
    const e = new Error('All camera tiers failed');
    e.attempts = attempts;
    throw e;
  }
}

/**
 * Apply the bulletproof, cross-browser style for a video element that
 * should fill the entire viewport at native resolution without stretching.
 * iOS Safari refuses autoplay without muted+playsinline, so we force them.
 * Idempotent — safe to call multiple times (rotation, visibility change).
 */
export function styleAsFullscreenVideo(video) {
  if (!video) return;
  Object.assign(video.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    objectFit: 'cover',
    objectPosition: 'center',
    zIndex: '-1',
    background: '#000',
  });
  // iOS Safari needs all three or it silently refuses to play inline.
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.defaultMuted = true;
}
