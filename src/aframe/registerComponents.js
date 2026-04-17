/**
 * Custom A-Frame components for XPortl.
 * Must be called ONCE before any <a-scene> renders.
 */

export function registerXPortlComponents() {
  const AFRAME = window.AFRAME;
  if (!AFRAME) {
    console.warn('[XPortl] A-Frame not loaded');
    return;
  }

  if (AFRAME.components['capsule-data']) return;

  // ── fixed-altitude: locks entity Y to a fixed height regardless of GPS altitude ──
  AFRAME.registerComponent('fixed-altitude', {
    schema: { y: { type: 'number', default: 0 } },
    tick() {
      this.el.object3D.position.y = this.data.y;
    },
  });

  // ── directional-gate: hide entity unless viewer aims in the right direction ──
  // Module-level orientation tracker for the A-Frame tick loop
  let _gateHeading = null;
  let _gatePitch = null;
  const gateHandler = (e) => {
    _gateHeading = e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
    if (e.beta !== null) _gatePitch = 90 - e.beta;
  };
  window.addEventListener('deviceorientationabsolute', gateHandler, true);
  window.addEventListener('deviceorientation', gateHandler, true);

  AFRAME.registerComponent('directional-gate', {
    schema: {
      targetHeading: { type: 'number', default: 0 },
      targetPitch: { type: 'number', default: 0 },
      headingTolerance: { type: 'number', default: 15 },
      pitchTolerance: { type: 'number', default: 20 },
    },
    init() {
      this._lastCheck = 0;
      this.el.object3D.visible = false; // hidden until aimed at
    },
    tick(time) {
      // Throttle to ~10Hz
      if (time - this._lastCheck < 100) return;
      this._lastCheck = time;

      if (_gateHeading === null) return;

      const dH = this.data.targetHeading;
      const dP = this.data.targetPitch;

      // Shortest angular distance (handles 0/360 wraparound)
      let headingDiff = _gateHeading - dH;
      headingDiff = ((headingDiff + 180) % 360 + 360) % 360 - 180;

      const pitchDiff = (_gatePitch || 0) - dP;

      const inView =
        Math.abs(headingDiff) <= this.data.headingTolerance &&
        Math.abs(pitchDiff) <= this.data.pitchTolerance;

      this.el.object3D.visible = inView;
    },
  });

  // ── capsule-data: click handler + haptic feedback ──
  AFRAME.registerComponent('capsule-data', {
    schema: {
      capsuleId: { type: 'string', default: '' },
      locked: { type: 'boolean', default: false },
    },
    init() {
      this.el.addEventListener('click', () => {
        if (navigator.vibrate) {
          navigator.vibrate(this.data.locked ? [200, 100, 200] : [100, 50, 100]);
        }
        window.dispatchEvent(
          new CustomEvent('xportl:capsule-click', {
            detail: { id: this.data.capsuleId },
          })
        );
      });
    },
  });

  // ── vortex-data: click handler for vortex clusters ──
  AFRAME.registerComponent('vortex-data', {
    schema: {
      vortexId: { type: 'string', default: '' },
    },
    init() {
      this.el.addEventListener('click', () => {
        if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 80]);
        window.dispatchEvent(
          new CustomEvent('xportl:vortex-click', {
            detail: { id: this.data.vortexId },
          })
        );
      });
    },
  });

  // ── glitch-glow: emissive pulsing with glitch flicker ──
  AFRAME.registerComponent('glitch-glow', {
    schema: {
      color: { type: 'color', default: '#00ff88' },
      minIntensity: { type: 'number', default: 0.3 },
      maxIntensity: { type: 'number', default: 1.2 },
      speed: { type: 'number', default: 2000 },
      locked: { type: 'boolean', default: false },
    },
    init() {
      this.startTime = Date.now();
    },
    tick() {
      const mesh = this.el.getObject3D('mesh');
      if (!mesh || !mesh.material) return;

      const elapsed = Date.now() - this.startTime;
      const t = (Math.sin((elapsed / this.data.speed) * Math.PI * 2) + 1) / 2;
      const intensity =
        this.data.minIntensity + t * (this.data.maxIntensity - this.data.minIntensity);

      mesh.material.emissiveIntensity = intensity;

      const flickerChance = this.data.locked ? 0.008 : 0.003;
      if (Math.random() < flickerChance) {
        mesh.material.opacity = this.data.locked ? 0.15 : 0.3;
        setTimeout(() => {
          if (mesh.material) mesh.material.opacity = 0.85;
        }, this.data.locked ? 120 : 60);
      }
    },
  });

  // ── ping-rise: makes an entity rise and fade over its lifetime ──
  AFRAME.registerComponent('ping-rise', {
    schema: {
      duration: { type: 'number', default: 15000 },
      maxHeight: { type: 'number', default: 12 },
    },
    init() {
      this.startTime = Date.now();
      this.startY = this.el.object3D.position.y;
    },
    tick() {
      const elapsed = Date.now() - this.startTime;
      const t = Math.min(1, elapsed / this.data.duration);

      // Rise with easing
      const ease = 1 - Math.pow(1 - t, 2);
      this.el.object3D.position.y = this.startY + ease * this.data.maxHeight;

      // Fade out in last 40%
      const fadeStart = 0.6;
      if (t > fadeStart) {
        const fadeT = (t - fadeStart) / (1 - fadeStart);
        const meshes = this.el.object3D.children;
        meshes.forEach((child) => {
          if (child.material) {
            child.material.opacity = 1 - fadeT;
          }
        });
      }

      // Self-remove when done
      if (t >= 1 && this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
    },
  });
}
