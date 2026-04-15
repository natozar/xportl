import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  isImmersiveARSupported,
  startSpatialSession,
  endSpatialSession,
  extractPlanes,
  initHitTest,
  getHitTestResults,
  calculateProximity,
  getProximityHaptic,
  getProximityColor,
} from '../services/spatialEngine';

/**
 * IndoorScene — WebXR immersive AR with plane detection.
 *
 * Renders detected surfaces as translucent meshes, places capsule portals
 * on walls/floors, and provides hot/cold proximity feedback.
 *
 * Falls back to a "not supported" message on incompatible browsers.
 */
export default function IndoorScene({ capsules, onCapsuleFound, onClose }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const sessionRef = useRef(null);
  const animFrameRef = useRef(null);

  const [supported, setSupported] = useState(null); // null=checking, true/false
  const [scanning, setScanning] = useState(false);
  const [planeCount, setPlaneCount] = useState(0);
  const [proximity, setProximity] = useState(null); // { distance, intensity, color }
  const [foundCapsule, setFoundCapsule] = useState(null);

  // Check support on mount
  useEffect(() => {
    isImmersiveARSupported().then(setSupported);
  }, []);

  // ── Start WebXR session ──
  const startSession = useCallback(async () => {
    if (!canvasRef.current) return;

    try {
      setScanning(true);
      const { session, refSpace, gl } = await startSpatialSession(canvasRef.current);
      sessionRef.current = { session, refSpace, gl };

      await initHitTest(session, refSpace);

      // ── Render loop ──
      let lastHapticTime = 0;

      const onFrame = (time, frame) => {
        if (!sessionRef.current) return;

        animFrameRef.current = session.requestAnimationFrame(onFrame);

        const glLayer = session.renderState.baseLayer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, glLayer.framebuffer);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Extract detected planes
        const planes = extractPlanes(frame, refSpace);
        setPlaneCount(planes.length);

        // Draw plane wireframes
        drawPlanes(gl, planes, glLayer);

        // Get viewer pose (user's head position)
        const viewerPose = frame.getViewerPose(refSpace);
        if (!viewerPose) return;

        const userPos = viewerPose.transform.position;

        // Hit test (where the user is looking)
        const hits = getHitTestResults(frame, refSpace);
        if (hits.length > 0) {
          drawReticle(gl, hits[0], glLayer);
        }

        // Proximity to nearest capsule (simulated as anchored to detected surfaces)
        if (capsules.length > 0) {
          // Find closest capsule (using planes as anchoring hints)
          let closest = null;
          let closestProx = null;

          for (const cap of capsules) {
            // Map GPS-based capsules to spatial positions relative to user
            // For indoor: use bearing + distance to place them on detected walls
            const bearing = Math.atan2(cap.lng - (cap._spatialX || 0), cap.lat - (cap._spatialZ || 0));
            const dist = cap.distance_meters || 3;

            const targetPos = {
              x: Math.sin(bearing) * Math.min(dist, 5),
              y: 1.2,
              z: -Math.cos(bearing) * Math.min(dist, 5),
            };

            const prox = calculateProximity(userPos, targetPos, 5);
            if (!closestProx || prox.distance < closestProx.distance) {
              closest = cap;
              closestProx = prox;
            }
          }

          if (closestProx) {
            const color = getProximityColor(closestProx.intensity);
            setProximity({ ...closestProx, color });

            // Haptic feedback (throttled to every 500ms)
            if (time - lastHapticTime > 500) {
              const pattern = getProximityHaptic(closestProx.intensity);
              if (pattern && navigator.vibrate) {
                navigator.vibrate(pattern);
                lastHapticTime = time;
              }
            }

            // Found! (within 0.5m)
            if (closestProx.distance < 0.5 && closest) {
              setFoundCapsule(closest);
              if (navigator.vibrate) navigator.vibrate([200, 50, 200, 50, 300]);
            }
          }
        }
      };

      session.requestAnimationFrame(onFrame);
    } catch (err) {
      console.error('[XPortl Spatial] Session failed:', err);
      setScanning(false);
    }
  }, [capsules]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (animFrameRef.current && sessionRef.current?.session) {
        sessionRef.current.session.cancelAnimationFrame(animFrameRef.current);
      }
      endSpatialSession();
    };
  }, []);

  const handleFoundOpen = () => {
    if (foundCapsule && onCapsuleFound) {
      onCapsuleFound(foundCapsule);
      setFoundCapsule(null);
    }
  };

  // ── Not supported ──
  if (supported === false) {
    return (
      <div style={s.container}>
        <div style={s.unsupported}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 16, opacity: 0.4 }}>
            <path d="M1 1l22 22M9.5 4h5l1 3H18a2 2 0 012 2v9.5M21 21H3a2 2 0 01-2-2V9a2 2 0 012-2h.5"
              stroke="#ff3366" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="12" cy="14" r="3" stroke="#ff3366" strokeWidth="1.5" />
          </svg>
          <h3 style={s.unsupportedTitle}>WEBXR NAO DISPONIVEL</h3>
          <p style={s.unsupportedText}>
            Deteccao espacial requer Chrome 113+ (Android) ou Safari 18+ (iOS com LiDAR).
            Use o modo "Explorar" para AR baseado em GPS.
          </p>
          <button style={s.unsupportedBtn} onClick={onClose}>Voltar ao AR GPS</button>
        </div>
      </div>
    );
  }

  // ── Loading check ──
  if (supported === null) {
    return (
      <div style={s.container}>
        <div style={s.loading}>
          <div style={s.spinner} />
          <span style={s.loadingText}>Verificando sensores espaciais...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {/* WebGL canvas for XR rendering */}
      <canvas ref={canvasRef} style={s.canvas} />

      {/* DOM Overlay (UI on top of AR) */}
      <div id="spatial-overlay" ref={overlayRef} style={s.overlay}>
        {/* Header */}
        <div style={s.header}>
          <button style={s.closeBtn} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <div style={s.headerInfo}>
            <span style={s.modeBadge}>MODO INDOOR</span>
            {scanning && (
              <span style={s.planeCount}>
                {planeCount} superficies detectadas
              </span>
            )}
          </div>
        </div>

        {/* Scan button (before session starts) */}
        {!scanning && (
          <div style={s.startContainer}>
            <button style={s.startBtn} onClick={startSession}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }}>
                <path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" stroke="#00f0ff" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="4" stroke="#00f0ff" strokeWidth="1.5" fill="rgba(0,240,255,0.1)" />
              </svg>
              ESCANEAR AMBIENTE
            </button>
            <p style={s.startHint}>
              Aponte a camera para o chao e paredes. Mova devagar para detectar superficies.
            </p>
          </div>
        )}

        {/* Proximity indicator */}
        {proximity && scanning && (
          <div style={s.proximityBar}>
            <div style={{
              ...s.proximityFill,
              width: `${proximity.intensity * 100}%`,
              background: proximity.color.hex,
              boxShadow: `0 0 12px ${proximity.color.hex}`,
            }} />
            <span style={s.proximityLabel}>
              {proximity.distance < 0.5 ? 'PORTAL ENCONTRADO!' :
               proximity.distance < 1 ? 'Muito perto!' :
               proximity.distance < 2 ? 'Perto...' :
               proximity.distance < 3 ? 'Esquentando...' :
               'Esfriando...'}
            </span>
            <span style={s.proximityDist}>{proximity.distance.toFixed(1)}m</span>
          </div>
        )}

        {/* Scanning indicator */}
        {scanning && planeCount === 0 && (
          <div style={s.scanHint}>
            <div style={s.scanPulse} />
            Mova o celular devagar... detectando superficies
          </div>
        )}

        {/* Found capsule popup */}
        {foundCapsule && (
          <div style={s.foundPopup}>
            <div style={s.foundGlow} />
            <h3 style={s.foundTitle}>PORTAL ENCONTRADO!</h3>
            <p style={s.foundText}>
              {foundCapsule.content?.body?.slice(0, 50) || 'Portal escondido nesta superfice'}
            </p>
            <button style={s.foundBtn} onClick={handleFoundOpen}>
              Desbloquear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── WebGL drawing helpers (minimal, no Three.js dependency) ──

function drawPlanes(gl, planes, glLayer) {
  // Lightweight plane visualization — colored quads at detected positions
  // Full Three.js integration would go here for production
  for (const plane of planes) {
    const color = plane.semanticLabel === 'wall' ? [0, 0.94, 1, 0.06] :
                  plane.semanticLabel === 'floor' ? [0.7, 0.29, 1, 0.04] :
                  [1, 1, 1, 0.03];
    // In production: render actual polygon mesh from plane.vertices
    // For now: the WebXR compositor handles passthrough camera
  }
}

function drawReticle(gl, hit, glLayer) {
  // In production: draw a targeting reticle at the hit point
  // The DOM overlay handles most of the UI feedback
}

const s = {
  container: {
    position: 'fixed', inset: 0, zIndex: 100, background: '#000',
    pointerEvents: 'auto',
  },
  canvas: {
    width: '100%', height: '100%', display: 'block',
  },
  overlay: {
    position: 'fixed', inset: 0, zIndex: 101,
    pointerEvents: 'none',
    display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: 'calc(14px + env(safe-area-inset-top, 0px)) 16px 10px',
    pointerEvents: 'auto',
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'auto',
  },
  headerInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  modeBadge: {
    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em',
    color: '#b44aff', background: 'rgba(180,74,255,0.15)',
    padding: '3px 10px', borderRadius: 6, alignSelf: 'flex-start',
  },
  planeCount: { fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)' },

  // ── Start ──
  startContainer: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 16,
    pointerEvents: 'auto',
  },
  startBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '24px 40px', borderRadius: 20,
    background: 'rgba(0,240,255,0.08)', border: '1px solid rgba(0,240,255,0.25)',
    color: '#00f0ff', fontSize: '0.8rem', fontWeight: 700,
    letterSpacing: '0.15em', fontFamily: 'inherit',
    boxShadow: '0 0 40px rgba(0,240,255,0.1)',
    pointerEvents: 'auto',
  },
  startHint: {
    fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)',
    textAlign: 'center', maxWidth: 260, lineHeight: 1.6,
  },

  // ── Proximity ──
  proximityBar: {
    position: 'absolute', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
    left: 20, right: 20,
    height: 40, borderRadius: 20,
    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.06)',
    overflow: 'hidden',
    display: 'flex', alignItems: 'center',
    padding: '0 16px',
    pointerEvents: 'none',
  },
  proximityFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    borderRadius: 20, transition: 'width 0.3s ease, background 0.3s ease',
  },
  proximityLabel: {
    position: 'relative', zIndex: 2,
    fontSize: '0.65rem', fontWeight: 700, color: '#fff',
    letterSpacing: '0.05em',
  },
  proximityDist: {
    position: 'relative', zIndex: 2, marginLeft: 'auto',
    fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)',
    fontFamily: 'ui-monospace, monospace',
  },

  // ── Scan hint ──
  scanHint: {
    position: 'absolute', bottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 18px', borderRadius: 50,
    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)',
    color: 'rgba(255,255,255,0.5)', fontSize: '0.62rem',
    whiteSpace: 'nowrap', pointerEvents: 'none',
  },
  scanPulse: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#00f0ff', boxShadow: '0 0 10px #00f0ff',
    animation: 'pulse-ring 1.5s ease infinite',
  },

  // ── Found ──
  foundPopup: {
    position: 'absolute', bottom: 'calc(130px + env(safe-area-inset-bottom, 0px))',
    left: 20, right: 20,
    padding: '20px 24px', borderRadius: 20,
    background: 'rgba(0,240,255,0.08)', backdropFilter: 'blur(24px)',
    border: '1px solid rgba(0,240,255,0.3)',
    boxShadow: '0 0 40px rgba(0,240,255,0.15)',
    textAlign: 'center', pointerEvents: 'auto',
  },
  foundGlow: {
    position: 'absolute', inset: -2, borderRadius: 22,
    border: '2px solid rgba(0,240,255,0.4)',
    animation: 'pulse-ring 1s ease infinite',
    pointerEvents: 'none',
  },
  foundTitle: {
    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.2em',
    color: '#00f0ff', textShadow: '0 0 20px rgba(0,240,255,0.5)',
    margin: '0 0 6px',
  },
  foundText: {
    fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)', marginBottom: 12,
  },
  foundBtn: {
    padding: '12px 28px', borderRadius: 14,
    background: 'rgba(0,240,255,0.15)', border: '1px solid rgba(0,240,255,0.3)',
    color: '#00f0ff', fontSize: '0.78rem', fontWeight: 700,
    fontFamily: 'inherit', letterSpacing: '0.05em',
    pointerEvents: 'auto',
  },

  // ── Unsupported ──
  unsupported: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', padding: 32, textAlign: 'center',
  },
  unsupportedTitle: {
    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.15em',
    color: '#ff3366', marginBottom: 8,
  },
  unsupportedText: {
    fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.6,
    maxWidth: 300, marginBottom: 20,
  },
  unsupportedBtn: {
    padding: '12px 24px', borderRadius: 14,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', fontSize: '0.75rem', fontFamily: 'inherit',
    pointerEvents: 'auto',
  },

  // ── Loading ──
  loading: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', gap: 12,
  },
  spinner: {
    width: 24, height: 24, borderRadius: '50%',
    border: '2px solid rgba(180,74,255,0.2)', borderTopColor: '#b44aff',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em',
  },
};
