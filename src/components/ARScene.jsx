import { useEffect, useRef } from 'react';
import { registerXPortlComponents } from '../aframe/registerComponents';
import { isCapsuleLocked, getRarity } from '../services/capsules';
import { isPing, PING_LIFETIME } from '../services/pings';
import { clusterCapsules } from '../services/clustering';

const DEV_LAT = -23.5505;
const DEV_LNG = -46.6333;

const COLORS = {
  unlocked: { main: '#00ff88', core: '#ffffff', ring: '#00ff88', emissive: '#00ff88' },
  locked:   { main: '#b44aff', core: '#ff44aa', ring: '#8833cc', emissive: '#b44aff' },
  vortex:   { main: '#00e5ff', core: '#ffffff', ring: '#00e5ff', emissive: '#00e5ff' },
};

// Rarity visual overrides — scale, ring count, emissive intensity
const RARITY_VFX = {
  common:    { rings: 2, emMult: 1.0, haloMult: 1.0, spinSpeed: 1.0 },
  rare:      { rings: 3, emMult: 1.4, haloMult: 1.3, spinSpeed: 1.3 },
  legendary: { rings: 4, emMult: 2.0, haloMult: 1.8, spinSpeed: 1.6 },
  mythic:    { rings: 5, emMult: 3.0, haloMult: 2.5, spinSpeed: 2.0 },
};

export default function ARScene({ capsules, pings, onCapsuleClick, onVortexClick }) {
  const sceneContainerRef = useRef(null);
  const sceneRef = useRef(null);
  const entitiesRef = useRef(new Map());
  const initializedRef = useRef(false);

  // ── Build scene once, but wait for AFRAME + AR.js scripts to load ──
  useEffect(() => {
    if (initializedRef.current || !sceneContainerRef.current) return;

    let cancelled = false;
    let attempts = 0;

    const tryInit = () => {
      if (cancelled) return;
      // aframe.min.js sets window.AFRAME. aframe-ar.js registers the
      // gps-camera / gps-entity-place components (arjs itself is a SYSTEM,
      // not a component, so checking AFRAME.components.arjs always fails).
      // gps-camera is the concrete thing our scene depends on, so waiting
      // for it is both accurate and semantically what we actually need.
      const aframeReady = typeof window !== 'undefined' && !!window.AFRAME;
      const gpsReady = aframeReady && !!window.AFRAME.components?.['gps-camera'];

      if (!aframeReady || !gpsReady) {
        attempts += 1;
        if (attempts > 50) {
          console.error(
            '[XPortl] AR.js scripts failed to load after 5s. ' +
            'AFRAME:', !!window.AFRAME,
            'gps-camera component:', !!window.AFRAME?.components?.['gps-camera']
          );
          return;
        }
        setTimeout(tryInit, 100);
        return;
      }

      initScene();
    };

    tryInit();
    return () => { cancelled = true; };

    function initScene() {
    initializedRef.current = true;

    registerXPortlComponents();

    const scene = document.createElement('a-scene');
    scene.setAttribute('vr-mode-ui', 'enabled: false');
    // Use native pixel ratio (capped at 3 for perf) so the 3D overlay
    // renders at the same sharpness as the camera feed beneath it.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    scene.setAttribute('renderer', `antialias: true; alpha: true; logarithmicDepthBuffer: true; pixelRatio: ${dpr}; precision: highp`);
    // Request the max resolution the device sensor supports.
    // AR.js will pass sourceWidth/Height to getUserMedia as {ideal}.
    // Portrait phones: swap so the long axis matches the screen.
    const portrait = window.innerHeight > window.innerWidth;
    const sw = portrait ? 1440 : 2560;
    const sh = portrait ? 2560 : 1440;
    scene.setAttribute('arjs', `sourceType: webcam; debugUIEnabled: false; videoTexture: true; sourceWidth: ${sw}; sourceHeight: ${sh}; displayWidth: ${window.innerWidth * dpr}; displayHeight: ${window.innerHeight * dpr}`);

    const camera = document.createElement('a-camera');
    camera.setAttribute('gps-camera', buildGpsCameraAttr());
    camera.setAttribute('rotation-reader', '');

    const cursor = document.createElement('a-entity');
    cursor.setAttribute('cursor', 'fuse: false; rayOrigin: mouse');
    cursor.setAttribute('raycaster', 'objects: .clickable; far: 300; interval: 100');
    camera.appendChild(cursor);

    const crosshair = document.createElement('a-entity');
    crosshair.setAttribute('geometry', 'primitive: ring; radiusInner: 0.015; radiusOuter: 0.025');
    crosshair.setAttribute('material', 'color: #00ff88; shader: flat; opacity: 0.4');
    crosshair.setAttribute('position', '0 0 -1');
    camera.appendChild(crosshair);

    scene.appendChild(camera);

    const ambient = document.createElement('a-light');
    ambient.setAttribute('type', 'ambient');
    ambient.setAttribute('color', '#445566');
    ambient.setAttribute('intensity', '0.4');
    scene.appendChild(ambient);

    const point = document.createElement('a-light');
    point.setAttribute('type', 'point');
    point.setAttribute('color', '#00ff88');
    point.setAttribute('intensity', '0.3');
    point.setAttribute('distance', '50');
    point.setAttribute('position', '0 5 0');
    scene.appendChild(point);

    sceneContainerRef.current.appendChild(scene);
    sceneRef.current = scene;

    } // end initScene

    // Local cleanup is attached via React on the outer return above
  }, []);

  // Ensure the scene DOM is torn down if the component actually unmounts.
  useEffect(() => {
    return () => {
      if (sceneRef.current?.parentNode) {
        sceneRef.current.parentNode.removeChild(sceneRef.current);
      }
      initializedRef.current = false;
    };
  }, []);

  // ── Sync capsule + vortex entities ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const syncEntities = () => {
      // ONLY render capsules within 30m in AR.
      // Farther capsules are shown as edge indicators by NearbyOverlay.
      // This prevents capsules 200-500m away from appearing as floating
      // orbs in your face — especially with inaccurate indoor GPS.
      const AR_RENDER_RADIUS = 30; // meters
      const realCapsules = capsules.filter((c) =>
        !isPing(c) && c.distance_meters !== undefined && c.distance_meters <= AR_RENDER_RADIUS
      );

      // Run clustering
      const { singles, vortexes } = clusterCapsules(realCapsules);

      // Build desired set of IDs
      const desiredIds = new Set([
        ...singles.map((c) => c.id),
        ...vortexes.map((v) => v.id),
      ]);

      const existing = entitiesRef.current;

      // Remove stale
      for (const [id, el] of existing) {
        if (!desiredIds.has(id)) {
          el.parentNode?.removeChild(el);
          existing.delete(id);
        }
      }

      // Add singles — spread altitude so nearby capsules don't overlap
      singles.forEach((cap, i) => {
        if (existing.has(cap.id)) return;
        // Stagger Y between -1m and +3m so capsules fan out vertically
        const altY = (i % 5) * 1.0 - 1;
        const el = buildCapsuleEntity(cap, altY);
        scene.appendChild(el);
        existing.set(cap.id, el);
      });

      // Add vortexes — slightly elevated above singles
      vortexes.forEach((vortex, i) => {
        if (existing.has(vortex.id)) return;
        const altY = 1 + (i % 3) * 1.5;
        const el = buildVortexEntity(vortex, altY);
        scene.appendChild(el);
        existing.set(vortex.id, el);
      });
    };

    if (scene.hasLoaded) {
      syncEntities();
    } else {
      scene.addEventListener('loaded', syncEntities, { once: true });
    }
  }, [capsules]);

  // ── Sync pings (ephemeral emoji particles) ──
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !pings || pings.length === 0) return;

    const spawnPing = (ping) => {
      const key = `ping_${ping.id}`;
      if (entitiesRef.current.has(key)) return;

      const wrapper = document.createElement('a-entity');
      wrapper.setAttribute('gps-entity-place', `latitude: ${ping.lat}; longitude: ${ping.lng};`);
      wrapper.setAttribute('ping-rise', `duration: ${PING_LIFETIME}; maxHeight: 12`);

      const text = document.createElement('a-text');
      text.setAttribute('value', ping.content?.emoji || '?');
      text.setAttribute('align', 'center');
      text.setAttribute('width', '8');
      text.setAttribute('color', '#ffffff');
      text.setAttribute('shader', 'msdf');
      text.setAttribute('font', 'https://cdn.aframe.io/fonts/Exo2Bold.fnt');
      text.setAttribute('opacity', '1');
      text.setAttribute('look-at', '[gps-camera]');

      // Glow sphere behind emoji
      const glow = document.createElement('a-sphere');
      glow.setAttribute('radius', '0.8');
      glow.setAttribute('color', '#ffaa00');
      glow.setAttribute('material', 'opacity: 0.2; emissive: #ffaa00; emissiveIntensity: 1; transparent: true');
      glow.setAttribute('animation', 'property: scale; from: 0.8 0.8 0.8; to: 1.3 1.3 1.3; dur: 600; easing: easeInOutSine; loop: true; dir: alternate');

      wrapper.appendChild(glow);
      wrapper.appendChild(text);
      scene.appendChild(wrapper);
      entitiesRef.current.set(key, wrapper);

      // Auto-cleanup from our map after lifetime
      setTimeout(() => {
        entitiesRef.current.delete(key);
      }, PING_LIFETIME + 500);
    };

    pings.forEach(spawnPing);
  }, [pings]);

  // ── Click events ──
  useEffect(() => {
    const capsuleHandler = (e) => {
      const capsule = capsules.find((c) => c.id === e.detail.id);
      if (capsule && onCapsuleClick) onCapsuleClick(capsule);
    };
    const vortexHandler = (e) => {
      if (onVortexClick) onVortexClick(e.detail.id);
    };

    window.addEventListener('xportl:capsule-click', capsuleHandler);
    window.addEventListener('xportl:vortex-click', vortexHandler);
    return () => {
      window.removeEventListener('xportl:capsule-click', capsuleHandler);
      window.removeEventListener('xportl:vortex-click', vortexHandler);
    };
  }, [capsules, onCapsuleClick, onVortexClick]);

  return <div ref={sceneContainerRef} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}

// ── Build a single capsule entity ──
// The portal visual is: soft outer halo -> main sphere (emissive body) ->
// bright pulsing core -> two crossed orbital rings. The emissive floor is
// bumped up so the portal reads as a light source even in daylight.
function buildCapsuleEntity(cap, altitudeY = 0) {
  const locked = isCapsuleLocked(cap);
  const rarityInfo = getRarity(cap);
  const vfx = RARITY_VFX[rarityInfo.key] || RARITY_VFX.common;
  const scale = rarityInfo.scale;

  // Use rarity color for rare+ capsules, otherwise locked/unlocked palette
  const useRarityColor = rarityInfo.key !== 'common';
  const pal = locked
    ? COLORS.locked
    : useRarityColor
      ? { main: rarityInfo.color, core: '#ffffff', ring: rarityInfo.color, emissive: rarityInfo.color }
      : COLORS.unlocked;

  const wrapper = document.createElement('a-entity');
  wrapper.setAttribute('gps-entity-place', `latitude: ${cap.lat}; longitude: ${cap.lng};`);
  wrapper.setAttribute('look-at', '[gps-camera]');
  wrapper.setAttribute('fixed-altitude', `y: ${altitudeY}`);

  // Directional gate — only show when viewer aims in the right direction
  if (cap.heading_deg !== null && cap.heading_deg !== undefined) {
    wrapper.setAttribute('directional-gate',
      `targetHeading: ${cap.heading_deg}; targetPitch: ${cap.pitch_deg || 0}`);
  }

  // Outer halo — bigger and brighter for higher rarities
  const haloR = (3.6 * scale * vfx.haloMult).toFixed(1);
  const halo = document.createElement('a-sphere');
  halo.setAttribute('radius', haloR);
  halo.setAttribute('color', pal.emissive);
  halo.setAttribute('material', `opacity: ${(0.07 * vfx.emMult).toFixed(2)}; emissive: ${pal.emissive}; emissiveIntensity: ${(1.4 * vfx.emMult).toFixed(1)}; transparent: true; depthWrite: false; shader: flat`);
  halo.setAttribute('animation__halo', 'property: scale; from: 0.92 0.92 0.92; to: 1.08 1.08 1.08; dur: 2800; easing: easeInOutSine; loop: true; dir: alternate');

  // Main sphere
  const sphereR = (1.5 * scale).toFixed(2);
  const sphere = document.createElement('a-sphere');
  sphere.setAttribute('radius', sphereR);
  sphere.setAttribute('color', pal.main);
  sphere.setAttribute('material', `opacity: 0.9; emissive: ${pal.emissive}; emissiveIntensity: ${(1.3 * vfx.emMult).toFixed(1)}; transparent: true; metalness: 0.3; roughness: 0.25`);
  sphere.setAttribute('class', 'clickable');
  sphere.setAttribute('capsule-data', `capsuleId: ${cap.id}; locked: ${locked}`);
  sphere.setAttribute('glitch-glow', `color: ${pal.emissive}; speed: ${Math.round((locked ? 3500 : 2000) / vfx.spinSpeed)}; locked: ${locked}`);
  const spinDur = Math.round((locked ? 12000 : 8000) / vfx.spinSpeed);
  sphere.setAttribute('animation__spin', `property: rotation; from: 0 0 0; to: 0 360 0; dur: ${spinDur}; easing: linear; loop: true`);
  sphere.setAttribute('animation__float', 'property: position; from: 0 0 0; to: 0 1.2 0; dur: 3000; easing: easeInOutSine; loop: true; dir: alternate');

  // Core
  const core = document.createElement('a-sphere');
  core.setAttribute('radius', (0.55 * scale).toFixed(2));
  core.setAttribute('color', pal.core);
  core.setAttribute('material', `opacity: ${locked ? '0.3' : '0.65'}; emissive: ${pal.emissive}; emissiveIntensity: ${(locked ? 1.4 : 3.0 * vfx.emMult).toFixed(1)}; transparent: true; shader: flat`);
  core.setAttribute('animation', 'property: scale; from: 0.7 0.7 0.7; to: 1.35 1.35 1.35; dur: 1500; easing: easeInOutSine; loop: true; dir: alternate');
  sphere.appendChild(core);

  // Dynamic ring count based on rarity
  const ringAngles = [
    { rx: 70, ry: 0, r: 2.4, tube: 0.05, op: locked ? 0.25 : 0.55 },
    { rx: 20, ry: 45, r: 2.8, tube: 0.03, op: locked ? 0.15 : 0.35 },
    { rx: 50, ry: 120, r: 3.2, tube: 0.025, op: 0.25 },
    { rx: 10, ry: 200, r: 3.6, tube: 0.02, op: 0.2 },
    { rx: 80, ry: 60, r: 4.0, tube: 0.015, op: 0.15 },
  ];

  for (let i = 0; i < vfx.rings; i++) {
    const cfg = ringAngles[i];
    const ring = document.createElement('a-torus');
    ring.setAttribute('radius', (cfg.r * scale).toFixed(1));
    ring.setAttribute('radius-tubular', String(cfg.tube));
    ring.setAttribute('color', pal.ring);
    ring.setAttribute('material', `opacity: ${cfg.op}; emissive: ${pal.emissive}; emissiveIntensity: ${(1.1 * vfx.emMult * (1 - i * 0.15)).toFixed(1)}; transparent: true; shader: flat`);
    ring.setAttribute('rotation', `${cfg.rx} ${cfg.ry} 0`);
    const dur = Math.round((6000 + i * 2000) / vfx.spinSpeed);
    ring.setAttribute('animation', `property: rotation; from: ${cfg.rx} ${cfg.ry} 0; to: ${cfg.rx} ${cfg.ry + 360} 0; dur: ${dur}; easing: linear; loop: true`);
    wrapper.appendChild(ring);
  }

  wrapper.appendChild(halo);

  if (locked) {
    const lockRing = document.createElement('a-torus');
    lockRing.setAttribute('radius', (2.0 * scale).toFixed(1));
    lockRing.setAttribute('radius-tubular', '0.025');
    lockRing.setAttribute('color', '#ff3366');
    lockRing.setAttribute('material', 'opacity: 0.1; emissive: #ff3366; emissiveIntensity: 0.5; transparent: true');
    lockRing.setAttribute('rotation', '20 90 0');
    lockRing.setAttribute('animation', 'property: rotation; from: 20 90 0; to: 20 450 0; dur: 10000; easing: linear; loop: true');
    wrapper.appendChild(lockRing);
  }

  if (cap.media_type === 'audio' && cap.media_url) {
    const sound = document.createElement('a-entity');
    sound.setAttribute('sound', `src: url(${cap.media_url}); autoplay: false; loop: true; volume: 0.3; maxDistance: 30; refDistance: 5; rolloffFactor: 2; distanceModel: inverse`);
    wrapper.appendChild(sound);
  }

  wrapper.appendChild(sphere);
  return wrapper;
}

// ── Build a Vortex entity (cluster of 3+ capsules) ──
function buildVortexEntity(vortex, altitudeY = 0) {
  const pal = COLORS.vortex;

  const wrapper = document.createElement('a-entity');
  wrapper.setAttribute('gps-entity-place', `latitude: ${vortex.lat}; longitude: ${vortex.lng};`);
  wrapper.setAttribute('look-at', '[gps-camera]');
  wrapper.setAttribute('fixed-altitude', `y: ${altitudeY}`);

  // ── Octahedron core ──
  const octa = document.createElement('a-octahedron');
  octa.setAttribute('radius', '2.5');
  octa.setAttribute('color', pal.main);
  octa.setAttribute('material', `opacity: 0.7; emissive: ${pal.emissive}; emissiveIntensity: 0.8; transparent: true; metalness: 0.4; roughness: 0.2; wireframe: false`);
  octa.setAttribute('class', 'clickable');
  octa.setAttribute('vortex-data', `vortexId: ${vortex.id}`);
  octa.setAttribute('glitch-glow', `color: ${pal.emissive}; speed: 1200; minIntensity: 0.5; maxIntensity: 1.5`);

  // Multi-axis spin
  octa.setAttribute('animation__spinY', 'property: rotation; from: 0 0 0; to: 0 360 0; dur: 6000; easing: linear; loop: true');
  octa.setAttribute('animation__spinX', 'property: object3D.rotation.x; from: 0; to: 6.283; dur: 10000; easing: linear; loop: true; isRawProperty: true');

  // Breathing scale
  octa.setAttribute('animation__scale', 'property: scale; from: 0.9 0.9 0.9; to: 1.3 1.3 1.3; dur: 2000; easing: easeInOutSine; loop: true; dir: alternate');

  // Float
  octa.setAttribute('animation__float', 'property: position; from: 0 0 0; to: 0 1.5 0; dur: 2500; easing: easeInOutSine; loop: true; dir: alternate');

  // ── Inner wireframe octahedron ──
  const inner = document.createElement('a-octahedron');
  inner.setAttribute('radius', '1.2');
  inner.setAttribute('color', '#ffffff');
  inner.setAttribute('material', `opacity: 0.3; emissive: ${pal.emissive}; emissiveIntensity: 2; transparent: true; wireframe: true`);
  inner.setAttribute('animation', 'property: rotation; from: 0 0 0; to: 360 360 0; dur: 4000; easing: linear; loop: true');
  octa.appendChild(inner);

  // ── Orbital ring 1 ──
  const ring1 = document.createElement('a-torus');
  ring1.setAttribute('radius', '3.5');
  ring1.setAttribute('radius-tubular', '0.04');
  ring1.setAttribute('color', pal.ring);
  ring1.setAttribute('material', 'opacity: 0.25; emissive: #00e5ff; emissiveIntensity: 0.8; transparent: true');
  ring1.setAttribute('rotation', '60 0 0');
  ring1.setAttribute('animation', 'property: rotation; from: 60 0 0; to: 60 360 0; dur: 4000; easing: linear; loop: true');

  // ── Orbital ring 2 ──
  const ring2 = document.createElement('a-torus');
  ring2.setAttribute('radius', '3.0');
  ring2.setAttribute('radius-tubular', '0.03');
  ring2.setAttribute('color', '#b44aff');
  ring2.setAttribute('material', 'opacity: 0.15; emissive: #b44aff; emissiveIntensity: 0.6; transparent: true');
  ring2.setAttribute('rotation', '30 90 0');
  ring2.setAttribute('animation', 'property: rotation; from: 30 90 0; to: 30 450 0; dur: 5000; easing: linear; loop: true');

  // ── Count label (a-text) ──
  const label = document.createElement('a-text');
  label.setAttribute('value', `${vortex.count}`);
  label.setAttribute('align', 'center');
  label.setAttribute('color', '#00e5ff');
  label.setAttribute('width', '6');
  label.setAttribute('position', '0 3.5 0');
  label.setAttribute('look-at', '[gps-camera]');

  wrapper.appendChild(octa);
  wrapper.appendChild(ring1);
  wrapper.appendChild(ring2);
  wrapper.appendChild(label);
  return wrapper;
}

function buildGpsCameraAttr() {
  const parts = ['rotation-reader'];
  if (import.meta.env.DEV) {
    parts.push(`simulateLatitude: ${DEV_LAT}`);
    parts.push(`simulateLongitude: ${DEV_LNG}`);
  }
  return parts.join('; ');
}
