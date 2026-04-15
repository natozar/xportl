/**
 * Spatial Engine — WebXR plane detection + hit testing.
 *
 * Detects walls, floors, tables, ceilings in real-time using the device's
 * depth sensor / LiDAR / ARCore / ARKit. Returns detected planes as
 * typed geometry that the indoor scene can render.
 *
 * Requires: Chrome 113+ Android (ARCore), Safari 18+ iOS (ARKit).
 * Falls back gracefully on unsupported browsers.
 */

// ── Feature detection ──

export function isWebXRSupported() {
  return typeof navigator !== 'undefined' && !!navigator.xr;
}

export async function isImmersiveARSupported() {
  if (!isWebXRSupported()) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (_) {
    return false;
  }
}

export async function areFeaturesSupported(features = []) {
  if (!isWebXRSupported()) return { supported: false, missing: features };
  const missing = [];
  for (const f of features) {
    try {
      const ok = await navigator.xr.isSessionSupported('immersive-ar');
      if (!ok) missing.push(f);
    } catch (_) {
      missing.push(f);
    }
  }
  return { supported: missing.length === 0, missing };
}

// ── Session management ──

let _activeSession = null;
let _refSpace = null;

/**
 * Start a WebXR immersive-ar session with plane detection + hit testing.
 * Returns { session, refSpace } or throws.
 */
export async function startSpatialSession(canvas) {
  if (_activeSession) {
    console.warn('[XPortl Spatial] Session already active');
    return { session: _activeSession, refSpace: _refSpace };
  }

  const requiredFeatures = ['local-floor', 'hit-test'];
  const optionalFeatures = ['plane-detection', 'anchors', 'depth-sensing'];

  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures,
    optionalFeatures,
    domOverlay: { root: document.getElementById('spatial-overlay') || document.body },
  });

  // Bind to WebGL context
  const gl = canvas.getContext('webgl2', { xrCompatible: true }) ||
             canvas.getContext('webgl', { xrCompatible: true });

  await gl.makeXRCompatible();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

  _refSpace = await session.requestReferenceSpace('local-floor');
  _activeSession = session;

  session.addEventListener('end', () => {
    _activeSession = null;
    _refSpace = null;
  });

  return { session, refSpace: _refSpace, gl };
}

export function getActiveSession() {
  return _activeSession;
}

export function getRefSpace() {
  return _refSpace;
}

/**
 * End the current spatial session.
 */
export async function endSpatialSession() {
  if (_activeSession) {
    await _activeSession.end();
    _activeSession = null;
    _refSpace = null;
  }
}

// ── Plane extraction ──

/**
 * Extract detected planes from an XRFrame.
 * Returns array of { id, orientation, position, vertices, semanticLabel }
 *
 * orientation: 'horizontal' | 'vertical'
 * semanticLabel: 'floor' | 'wall' | 'ceiling' | 'table' | 'unknown'
 */
export function extractPlanes(frame, refSpace) {
  if (!frame.detectedPlanes) return [];

  const planes = [];

  for (const plane of frame.detectedPlanes) {
    const pose = frame.getPose(plane.planeSpace, refSpace);
    if (!pose) continue;

    const position = pose.transform.position;
    const orientation = plane.orientation; // 'horizontal' | 'vertical'

    // Semantic label (Chrome 120+, fallback to inference)
    let semanticLabel = plane.semanticLabel || 'unknown';
    if (semanticLabel === 'unknown') {
      if (orientation === 'horizontal') {
        semanticLabel = position.y < 0.3 ? 'floor' : position.y > 2.0 ? 'ceiling' : 'table';
      } else {
        semanticLabel = 'wall';
      }
    }

    // Convert polygon vertices
    const vertices = [];
    if (plane.polygon) {
      for (const point of plane.polygon) {
        vertices.push({ x: point.x, y: point.y, z: point.z });
      }
    }

    planes.push({
      id: plane.lastChangedTime || Math.random(),
      orientation,
      semanticLabel,
      position: { x: position.x, y: position.y, z: position.z },
      transform: pose.transform,
      vertices,
      area: estimateArea(vertices),
    });
  }

  return planes;
}

function estimateArea(vertices) {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].z;
    area -= vertices[j].x * vertices[i].z;
  }
  return Math.abs(area) / 2;
}

// ── Hit testing ──

let _hitTestSource = null;

/**
 * Initialize hit-test source (call once after session starts).
 * Casts a ray from the center of the screen into the detected world.
 */
export async function initHitTest(session, refSpace) {
  const viewerSpace = await session.requestReferenceSpace('viewer');
  _hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  return _hitTestSource;
}

/**
 * Get hit-test results for current frame.
 * Returns array of { position, normal } or empty.
 */
export function getHitTestResults(frame, refSpace) {
  if (!_hitTestSource) return [];

  const results = frame.getHitTestResults(_hitTestSource);
  return results.map((r) => {
    const pose = r.getPose(refSpace);
    if (!pose) return null;
    return {
      position: pose.transform.position,
      orientation: pose.transform.orientation,
      matrix: pose.transform.matrix,
    };
  }).filter(Boolean);
}

// ── Proximity (hot/cold) ──

/**
 * Calculate 3D distance between user and a target position.
 * Returns { distance, intensity } where intensity 0-1 (1 = very close)
 */
export function calculateProximity(userPos, targetPos, maxRange = 5) {
  const dx = userPos.x - targetPos.x;
  const dy = userPos.y - targetPos.y;
  const dz = userPos.z - targetPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const intensity = Math.max(0, 1 - distance / maxRange);

  return { distance, intensity };
}

/**
 * Get haptic pattern based on proximity intensity (0-1).
 * Closer = faster, stronger vibration.
 */
export function getProximityHaptic(intensity) {
  if (intensity < 0.1) return null; // too far, no haptic
  if (intensity > 0.9) return [100, 30, 100, 30, 100]; // very close: rapid triple
  if (intensity > 0.7) return [80, 50, 80]; // close: double pulse
  if (intensity > 0.4) return [60, 100]; // medium: single pulse
  return [30, 200]; // far: gentle tap
}

/**
 * Get color tint based on proximity (cold=blue → hot=orange → found=cyan)
 */
export function getProximityColor(intensity) {
  if (intensity > 0.9) return { r: 0, g: 240, b: 255, hex: '#00f0ff' }; // FOUND
  if (intensity > 0.7) return { r: 255, g: 107, b: 43, hex: '#ff6b2b' }; // HOT
  if (intensity > 0.4) return { r: 255, g: 170, b: 0, hex: '#ffaa00' }; // WARM
  if (intensity > 0.1) return { r: 100, g: 100, b: 200, hex: '#6464c8' }; // COOL
  return { r: 60, g: 60, b: 120, hex: '#3c3c78' }; // COLD
}
