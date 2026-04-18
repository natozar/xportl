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

  // ── fixed-altitude: set Y once, not every frame ──
  AFRAME.registerComponent('fixed-altitude', {
    schema: { y: { type: 'number', default: 0 } },
    init() {
      this.el.object3D.position.y = this.data.y;
    },
    update() {
      this.el.object3D.position.y = this.data.y;
    },
  });

  // ── Module-level orientation for directional-gate ──
  let _gateHeading = null;
  let _gatePitch = null;
  const gateHandler = (e) => {
    _gateHeading = e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
    if (e.beta !== null) _gatePitch = 90 - e.beta;
  };
  window.addEventListener('deviceorientationabsolute', gateHandler, true);
  window.addEventListener('deviceorientation', gateHandler, true);

  // ── directional-gate: hide entity unless viewer aims in the right direction ──
  AFRAME.registerComponent('directional-gate', {
    schema: {
      targetHeading: { type: 'number', default: 0 },
      targetPitch: { type: 'number', default: 0 },
      headingTolerance: { type: 'number', default: 15 },
      pitchTolerance: { type: 'number', default: 20 },
    },
    init() {
      this._lastCheck = 0;
      this._wasVisible = false;
      this.el.object3D.visible = false;
    },
    tick(time) {
      if (time - this._lastCheck < 150) return; // ~7Hz is enough
      this._lastCheck = time;
      if (_gateHeading === null) return;

      let hDiff = _gateHeading - this.data.targetHeading;
      hDiff = ((hDiff + 180) % 360 + 360) % 360 - 180;
      const pDiff = (_gatePitch || 0) - this.data.targetPitch;

      const inView =
        Math.abs(hDiff) <= this.data.headingTolerance &&
        Math.abs(pDiff) <= this.data.pitchTolerance;

      // Only toggle when state changes (avoid GPU churn)
      if (inView !== this._wasVisible) {
        this.el.object3D.visible = inView;
        this._wasVisible = inView;
      }
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

  // ── glitch-glow: emissive pulsing (throttled, no setTimeout leak) ──
  AFRAME.registerComponent('glitch-glow', {
    schema: {
      color: { type: 'color', default: '#00ff88' },
      minIntensity: { type: 'number', default: 0.3 },
      maxIntensity: { type: 'number', default: 1.2 },
      speed: { type: 'number', default: 2000 },
      locked: { type: 'boolean', default: false },
    },
    init() {
      this._startTime = performance.now();
      this._lastTick = 0;
      this._flickerEnd = 0;
    },
    tick(time) {
      // Throttle to ~15fps
      if (time - this._lastTick < 66) return;
      this._lastTick = time;

      const mesh = this.el.getObject3D('mesh');
      if (!mesh || !mesh.material) return;

      const elapsed = time - this._startTime;
      const t = (Math.sin((elapsed / this.data.speed) * Math.PI * 2) + 1) / 2;
      mesh.material.emissiveIntensity =
        this.data.minIntensity + t * (this.data.maxIntensity - this.data.minIntensity);

      // Flicker: use time comparison instead of setTimeout
      if (this._flickerEnd > 0) {
        if (time > this._flickerEnd) {
          mesh.material.opacity = 0.85;
          this._flickerEnd = 0;
        }
      } else {
        const chance = this.data.locked ? 0.008 : 0.003;
        if (Math.random() < chance) {
          mesh.material.opacity = this.data.locked ? 0.15 : 0.3;
          this._flickerEnd = time + (this.data.locked ? 120 : 60);
        }
      }
    },
  });

  // ── ping-rise: makes an entity rise and fade (throttled) ──
  AFRAME.registerComponent('ping-rise', {
    schema: {
      duration: { type: 'number', default: 15000 },
      maxHeight: { type: 'number', default: 12 },
    },
    init() {
      this._startTime = performance.now();
      this._startY = this.el.object3D.position.y;
      this._lastTick = 0;
      this._removed = false;
    },
    tick(time) {
      if (this._removed) return;
      // Throttle to ~10fps
      if (time - this._lastTick < 100) return;
      this._lastTick = time;

      const elapsed = time - this._startTime;
      const t = Math.min(1, elapsed / this.data.duration);
      const ease = 1 - Math.pow(1 - t, 2);
      this.el.object3D.position.y = this._startY + ease * this.data.maxHeight;

      // Fade in last 40%
      if (t > 0.6) {
        const fadeT = (t - 0.6) / 0.4;
        const opacity = 1 - fadeT;
        this.el.object3D.traverse((child) => {
          if (child.material && child.material.opacity !== undefined) {
            child.material.opacity = opacity;
          }
        });
      }

      // Remove after duration (deferred to avoid tick-removal issues)
      if (t >= 1 && !this._removed) {
        this._removed = true;
        setTimeout(() => {
          if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
        }, 0);
      }
    },
  });
}
