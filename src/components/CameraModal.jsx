import { useEffect, useRef, useState, useCallback } from 'react';
import { preloadNsfwModel } from '../services/nsfwFilter';
import {
  pickBestBackCameraId,
  applyAdvancedTrackConstraints,
  supportsTorch,
  setTorch,
  tapToFocus,
  adaptiveVideoBitrate,
} from '../services/cameraCapabilities';
import { useWakeLock } from '../hooks/useWakeLock';

const MAX_VIDEO_SECONDS = 15;
const MAX_IMAGE_DIMENSION = 4096;      // Full 4K — modern phones capture 48MP+
const IMAGE_QUALITY = 0.85;            // Slightly lower quality offsets larger resolution
const VIDEO_BITRATE = 4_000_000;       // 4 Mbps — crisp 1080p@60fps for 15s ≈ 7.5 MB
const AUDIO_BITRATE = 128_000;         // 128 kbps — broadcast quality
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB — room for 4K

// Resize + re-encode a source canvas so large phone captures don't bloat
// Storage. Returns { previewUrl, blob } or rejects if blob > MAX_UPLOAD_BYTES.
// Try AVIF first (20-30% better compression), fall back to WebP
function compressCanvasToWebp(source, facing) {
  return new Promise((resolve, reject) => {
    const sw = source.width;
    const sh = source.height;
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sw, sh));
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    const out = document.createElement('canvas');
    out.width = dw;
    out.height = dh;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (facing === 'user') {
      ctx.translate(dw, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(source, 0, 0, dw, dh);

    const previewUrl = out.toDataURL('image/webp', 0.6); // lightweight preview

    const tryEncode = (format, quality) => {
      return new Promise((res) => {
        out.toBlob((blob) => res(blob), format, quality);
      });
    };

    (async () => {
      // Try AVIF first (better compression at same quality)
      let blob = await tryEncode('image/avif', 0.80);

      // Fallback to WebP if AVIF not supported or too large
      if (!blob || blob.size > MAX_UPLOAD_BYTES) {
        blob = await tryEncode('image/webp', IMAGE_QUALITY);
      }

      if (!blob) return reject(new Error('Falha ao codificar imagem'));
      if (blob.size > MAX_UPLOAD_BYTES) {
        return reject(new Error('Imagem muito grande mesmo apos compressao'));
      }
      resolve({ previewUrl, blob });
    })();
  });
}

/**
 * Fullscreen camera with live preview, front/back toggle, photo mode,
 * and short-video mode capped at 15 seconds.
 *
 * Props:
 *   onClose()                    — user dismissed without capturing
 *   onCapture({blob,type,preview}) — user confirmed a capture; blob is
 *     ready for upload, preview is a data URL for the panel thumbnail.
 *   initialMode: 'photo'|'video' (default 'photo')
 */
// Try getUserMedia once; on NotReadableError (device busy) wait 500ms and
// retry once. iOS/Android sometimes hold the lock a hair longer than we'd
// like after the previous consumer calls .stop().
async function requestStreamWithRetry(constraints) {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    if (err?.name === 'NotReadableError') {
      await new Promise((r) => setTimeout(r, 500));
      return navigator.mediaDevices.getUserMedia(constraints);
    }
    throw err;
  }
}

function decodeGumError(err) {
  const name = err?.name || 'Error';
  if (name === 'NotAllowedError')     return 'Permissao de camera negada. Ajuste nas configuracoes do navegador.';
  if (name === 'NotFoundError')       return 'Nenhuma camera encontrada neste dispositivo.';
  if (name === 'NotReadableError')    return 'Camera em uso por outro app ou aba. Feche e tente de novo.';
  if (name === 'OverconstrainedError') return 'Este dispositivo nao suporta a resolucao pedida.';
  if (name === 'SecurityError')       return 'Acesso a camera bloqueado por politica de seguranca.';
  return err?.message || 'Erro desconhecido ao abrir camera.';
}

function findArVideo() {
  return (
    document.querySelector('a-scene video') ||
    document.querySelector('#arjs-video') ||
    document.querySelector('video[autoplay][playsinline]')
  );
}

// Release AR.js's camera so our getUserMedia can grab the same device.
// iOS/Android reject a second consumer on the back camera with
// NotReadableError, so the modal must own the stream exclusively while open.
function releaseArCamera() {
  const arVideo = findArVideo();
  if (!arVideo) return null;
  const stream = arVideo.srcObject;
  if (stream && stream.getTracks) {
    stream.getTracks().forEach((t) => t.stop());
  }
  try { arVideo.pause(); } catch (_) { /* ignore */ }
  arVideo.srcObject = null;
  return arVideo;
}

// Re-acquire the back camera and hand it back to AR.js's <video>.
// Fire and forget: if AR fails to restart the user can reload the app.
function restoreArCamera(arVideo) {
  if (!arVideo) return;
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 1920 } }, audio: false })
    .then((stream) => {
      arVideo.srcObject = stream;
      return arVideo.play().catch(() => {});
    })
    .catch((err) => {
      console.warn('[XPortl] Failed to restore AR camera:', err);
    });
}

const MEDIA_RECORDER_SUPPORTED = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined';
const GET_USER_MEDIA_SUPPORTED =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export default function CameraModal({ onClose, onCapture, initialMode = 'photo' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const arVideoRef = useRef(null);

  const [facing, setFacing] = useState('environment');
  const [mode, setMode] = useState(initialMode);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState(null); // { blob, type, previewUrl }
  const [error, setError] = useState(null);
  const [loadingStream, setLoadingStream] = useState(true);
  const [retryTick, setRetryTick] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const bestBackIdRef = useRef(null); // cached deviceId of main wide back camera

  // Keep the screen awake while the modal is open — capturing media is
  // exactly the moment a user does NOT want the screen to dim.
  useWakeLock(true);

  // Warm up the NSFW classifier while the user is framing the shot so the
  // confirmation step doesn't stall for 3-5 seconds on the first scan.
  useEffect(() => { preloadNsfwModel(); }, []);

  // ESC closes the modal when nothing is mid-recording
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !recording) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, recording]);

  // If video recording isn't supported, force photo mode and keep it there
  useEffect(() => {
    if (!MEDIA_RECORDER_SUPPORTED && mode === 'video') setMode('photo');
  }, [mode]);

  // Hard preflight: bail out with a clear message if the browser can't
  // do anything we need, instead of a generic "erro ao abrir camera".
  useEffect(() => {
    if (!GET_USER_MEDIA_SUPPORTED) {
      setError('Este navegador nao suporta acesso a camera.');
      setLoadingStream(false);
    }
  }, []);

  // Release AR.js's camera once on mount so the modal can own the device.
  // Stored ref is restored on unmount by the cleanup effect below.
  useEffect(() => {
    arVideoRef.current = releaseArCamera();
  }, []);

  // (re)open stream when facing / mode / retry changes.
  // Note: audio is NOT requested here. Recording pulls audio inside the
  // click handler so iOS Safari sees a direct user gesture.
  useEffect(() => {
    if (preview) return;               // paused in preview state
    if (!GET_USER_MEDIA_SUPPORTED) return;

    let cancelled = false;
    setLoadingStream(true);
    setError(null);

    (async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        // Give iOS / Android a beat to release the device handle after
        // whatever was holding it (AR.js or our own previous stream).
        await new Promise((r) => setTimeout(r, 300));

        // For the back camera, try to pin to the MAIN wide lens. Without
        // this, browsers sometimes default to a telephoto or macro lens
        // which has a tiny FOV and looks broken for AR-style framing.
        const isBack = facing === 'environment';
        if (isBack && bestBackIdRef.current === null) {
          bestBackIdRef.current = await pickBestBackCameraId().catch(() => null);
        }
        const lensId = isBack ? bestBackIdRef.current : null;

        // Build constraints. deviceId (when known) is exact-pinned;
        // facingMode is the safe fallback. 'ideal' on resolution lets
        // the browser pick the closest the sensor actually supports.
        const baseVideo = lensId
          ? { deviceId: { exact: lensId } }
          : { facingMode: facing };

        const videoConstraints = mode === 'video'
          ? {
              ...baseVideo,
              width:     { ideal: isBack ? 1920 : 1280 },
              height:    { ideal: isBack ? 1080 : 720 },
              frameRate: { ideal: 60, max: 60 },
            }
          : {
              ...baseVideo,
              width:  { ideal: isBack ? 4096 : 1920 },
              height: { ideal: isBack ? 3072 : 1080 },
            };

        let stream;
        try {
          stream = await requestStreamWithRetry({ video: videoConstraints, audio: false });
        } catch (err) {
          // OverconstrainedError on a pinned deviceId → drop the pin and retry
          // with facingMode so we still get *some* camera.
          if (err?.name === 'OverconstrainedError' && lensId) {
            console.warn('[XPortl] Best-lens pin rejected, falling back to facingMode');
            bestBackIdRef.current = null;
            const fallback = { ...videoConstraints };
            delete fallback.deviceId;
            fallback.facingMode = facing;
            stream = await requestStreamWithRetry({ video: fallback, audio: false });
          } else {
            throw err;
          }
        }
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        if (track) {
          // Continuous AF/AE/AWB → sharper frames in changing light.
          applyAdvancedTrackConstraints(track).catch(() => {});
          setTorchAvailable(supportsTorch(track));
          setTorchOn(false);
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.setAttribute('playsinline', '');
          try { await videoRef.current.play(); } catch (_) { /* iOS */ }
        }
        setLoadingStream(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[XPortl] CameraModal getUserMedia failed:', err);
        setError(decodeGumError(err));
        setLoadingStream(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [facing, mode, preview, retryTick]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop any in-flight recording first — otherwise MediaRecorder keeps
      // running in the background after the modal closes, holding the
      // stream, draining battery, and leaking memory.
      if (recorderRef.current) {
        try {
          if (recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
          }
        } catch { /* recorder already torn down — noop */ }
        recorderRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
        audioStreamRef.current = null;
      }
      if (preview?.previewUrl && preview.type === 'video') {
        URL.revokeObjectURL(preview.previewUrl);
      }
      // Hand the camera back to AR.js after a short delay so iOS releases
      // the lock between our teardown and AR's re-acquire.
      const arVideo = arVideoRef.current;
      arVideoRef.current = null;
      if (arVideo) {
        setTimeout(() => restoreArCamera(arVideo), 300);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFacing = useCallback(() => {
    // Switching cameras invalidates the cached lens pin (front cams have
    // their own deviceId list).
    bestBackIdRef.current = null;
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    const ok = await setTorch(track, next);
    if (ok) setTorchOn(next);
  }, [torchOn]);

  // Tap-to-focus: convert click coords to normalized (0..1) frame coords
  // and ask the driver to focus + meter exposure on that point.
  const handleVideoTap = useCallback(async (e) => {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!video || !track) return;
    const rect = video.getBoundingClientRect();
    const cx = (e.touches?.[0]?.clientX ?? e.clientX) - rect.left;
    const cy = (e.touches?.[0]?.clientY ?? e.clientY) - rect.top;
    const x = Math.max(0, Math.min(1, cx / rect.width));
    const y = Math.max(0, Math.min(1, cy / rect.height));
    await tapToFocus(track, x, y);
    if (navigator.vibrate) navigator.vibrate(8);
  }, []);

  const _toggleMode = useCallback(() => {
    setMode((m) => (m === 'photo' ? 'video' : 'photo'));
  }, []);

  const snapPhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    // Draw the raw frame first (no mirroring — compressCanvasToWebp handles it)
    const raw = document.createElement('canvas');
    raw.width = video.videoWidth;
    raw.height = video.videoHeight;
    raw.getContext('2d').drawImage(video, 0, 0);

    try {
      const { previewUrl, blob } = await compressCanvasToWebp(raw, facing);
      setPreview({ blob, type: 'image', previewUrl });
      if (navigator.vibrate) navigator.vibrate(20);
    } catch (err) {
      setError(err.message || 'Erro ao processar foto');
      return;
    }

    // Stop live stream while user decides; restart on retake.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [facing]);

  const startVideo = useCallback(async () => {
    if (!streamRef.current) return;
    if (!MEDIA_RECORDER_SUPPORTED) {
      setError('Este navegador nao suporta gravacao de video.');
      return;
    }
    chunksRef.current = [];

    // Pull the mic INSIDE the user-gesture callback so iOS Safari grants
    // permission. Combine with the existing video track into a fresh
    // MediaStream that the recorder can consume.
    let recStream = streamRef.current;
    try {
      const audioStream = await requestStreamWithRetry({ audio: true, video: false });
      audioStreamRef.current = audioStream;
      recStream = new MediaStream([
        ...streamRef.current.getVideoTracks(),
        ...audioStream.getAudioTracks(),
      ]);
    } catch (audErr) {
      console.warn('[XPortl] Audio track unavailable, recording video-only:', audErr);
    }

    try {
      // Prefer modern codecs first: AV1 → VP9 → VP8.
      // AV1 cuts size ~50% vs VP9 at the same quality on devices that ship
      // hardware decoders (Pixel 6+, iPhone 15+ via promo).
      const mimeType =
        MediaRecorder.isTypeSupported('video/webm;codecs=av01,opus') ? 'video/webm;codecs=av01,opus' :
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')  ? 'video/webm;codecs=vp9,opus'  :
        MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')  ? 'video/webm;codecs=vp8,opus'  :
        'video/webm';

      // Adaptive bitrate: don't slam a 4 Mbps stream into a 3G connection
      // or a saveData session. adaptiveVideoBitrate inspects navigator.connection.
      const videoBps = adaptiveVideoBitrate(VIDEO_BITRATE);

      const recorder = new MediaRecorder(recStream, {
        mimeType,
        videoBitsPerSecond: videoBps,
        audioBitsPerSecond: AUDIO_BITRATE,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        // Release mic as soon as recording ends
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((t) => t.stop());
          audioStreamRef.current = null;
        }
        if (blob.size === 0) {
          setError('Gravacao vazia. Tente novamente.');
          chunksRef.current = [];
          setPreview(null);
          return;
        }
        if (blob.size > MAX_UPLOAD_BYTES) {
          setError(`Video muito grande (${(blob.size / 1024 / 1024).toFixed(1)} MB). Limite: 5 MB.`);
          chunksRef.current = [];
          setPreview(null);
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        setPreview({ blob, type: 'video', previewUrl });
        if (navigator.vibrate) navigator.vibrate([20, 40, 20]);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
    } catch (err) {
      setError('Gravacao indisponivel: ' + err.message);
    }
  }, []);

  const stopVideo = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setRecording(false);
  }, []);

  // tick elapsed + auto-stop at 15s
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => {
      const secs = (Date.now() - recordStartRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_VIDEO_SECONDS) stopVideo();
    }, 100);
    return () => clearInterval(interval);
  }, [recording, stopVideo]);

  const retake = useCallback(() => {
    if (preview?.previewUrl && preview.type === 'video') {
      URL.revokeObjectURL(preview.previewUrl);
    }
    setPreview(null);
    setElapsed(0);
    // useEffect on [facing, mode, preview] restarts the stream
  }, [preview]);

  const confirm = useCallback(() => {
    if (!preview) return;
    onCapture(preview);
  }, [preview, onCapture]);

  const shutterDisabled = !preview && (loadingStream || !!error || !streamRef.current);

  return (
    <div style={s.backdrop}>
      {error && (
        <div style={s.errorPanel}>
          <div style={s.errorTitle}>camera indisponivel</div>
          <div style={s.errorMsg}>{error}</div>
          <div style={s.errorBtnRow}>
            <button style={s.btnGhost} onClick={onClose}>voltar</button>
            <button style={s.btnPrimary} onClick={() => { setError(null); setRetryTick((n) => n + 1); }}>
              tentar de novo
            </button>
          </div>
        </div>
      )}

      {loadingStream && !error && !preview && (
        <div style={s.loadingOverlay}>
          <div style={s.loadingSpinner} />
          <div style={s.loadingText}>abrindo camera...</div>
        </div>
      )}

      {!preview ? (
        <>
          <video
            ref={videoRef}
            style={{ ...s.video, transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
            playsInline
            muted
          />

          {/* Tap-to-focus surface — sits above the (pointerEvents: none) video,
              below the controls. Covers the full preview. */}
          <div
            style={s.focusSurface}
            onClick={handleVideoTap}
            onTouchStart={handleVideoTap}
            aria-label="Toque para focar"
          />

          <button style={s.closeBtn} onClick={onClose} aria-label="Fechar">×</button>

          {torchAvailable && (
            <button
              style={{ ...s.torchBtn, ...(torchOn ? s.torchBtnOn : {}) }}
              onClick={toggleTorch}
              aria-label={torchOn ? 'Desligar lanterna' : 'Ligar lanterna'}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={torchOn ? '#ffd64a' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2h6l-1 6h-4z" />
                <path d="M8 8h8l-1 4H9z" />
                <path d="M10 12h4v8a2 2 0 0 1-4 0z" />
              </svg>
            </button>
          )}

          {mode === 'video' && recording && (
            <div style={s.recBadge}>
              <span style={s.recDot} />
              <span>{elapsed.toFixed(1)}s / {MAX_VIDEO_SECONDS}s</span>
            </div>
          )}

          <div style={s.bottomBar}>
            <div style={s.modeRow}>
              <button
                style={{ ...s.modeBtn, ...(mode === 'photo' ? s.modeBtnActive : {}) }}
                onClick={() => !recording && setMode('photo')}
                disabled={recording}
              >
                foto
              </button>
              {MEDIA_RECORDER_SUPPORTED && (
                <button
                  style={{ ...s.modeBtn, ...(mode === 'video' ? s.modeBtnActive : {}) }}
                  onClick={() => !recording && setMode('video')}
                  disabled={recording}
                >
                  video 15s
                </button>
              )}
            </div>

            <div style={s.actionRow}>
              <div style={s.sideSlot} />
              <button
                style={{
                  ...s.shutter,
                  ...(mode === 'video' && recording ? s.shutterRecording : {}),
                  ...(shutterDisabled ? { opacity: 0.35, pointerEvents: 'none' } : {}),
                }}
                disabled={shutterDisabled}
                onClick={mode === 'photo' ? snapPhoto : (recording ? stopVideo : startVideo)}
                aria-label={mode === 'photo' ? 'Capturar' : (recording ? 'Parar' : 'Gravar')}
              >
                <div style={{
                  ...s.shutterInner,
                  ...(mode === 'video'
                    ? (recording ? s.shutterSquare : s.shutterCircleRed)
                    : {}),
                }} />
              </button>
              <button
                style={{ ...s.flipBtn, ...(recording ? { opacity: 0.35 } : {}) }}
                onClick={toggleFacing}
                disabled={recording}
                aria-label="Virar camera"
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {/* Curved double-arrow flip glyph */}
                  <path d="M4 10a8 8 0 0 1 14-5" />
                  <path d="M20 14a8 8 0 0 1-14 5" />
                  <polyline points="18 1 18 6 13 6" />
                  <polyline points="6 23 6 18 11 18" />
                </svg>
                <span style={s.flipLabel}>{facing === 'environment' ? 'traseira' : 'frontal'}</span>
              </button>
            </div>
          </div>
        </>
      ) : (
        // ── Preview state ──
        <>
          {preview.type === 'image' ? (
            <img src={preview.previewUrl} alt="captura" style={s.previewMedia} />
          ) : (
            <video
              src={preview.previewUrl}
              style={s.previewMedia}
              controls
              autoPlay
              muted
              loop
              playsInline
            />
          )}

          <button style={s.closeBtn} onClick={onClose} aria-label="Fechar">×</button>

          <div style={s.bottomBar}>
            <div style={s.previewActions}>
              <button style={s.btnGhost} onClick={retake}>refazer</button>
              <button style={s.btnPrimary} onClick={confirm}>usar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 200, background: '#000',
    // Ensure this container captures all touch events (Android fix)
    touchAction: 'none',
  },
  video: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', background: '#000',
    // Video feed must NOT intercept button taps
    pointerEvents: 'none',
    zIndex: 1,
  },
  previewMedia: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'contain', background: '#000',
    pointerEvents: 'none',
    zIndex: 1,
  },
  closeBtn: {
    position: 'absolute', top: 'calc(14px + env(safe-area-inset-top, 0px))', right: 14,
    width: 44, height: 44,
    borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '1.5rem',
    cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, padding: 0,
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
  },
  focusSurface: {
    // Tap-to-focus lives in the middle strip only — clears the top
    // (close/torch) and bottom (shutter/flip/mode) so touch events
    // never compete with real controls on Android/iOS.
    position: 'absolute',
    top: 'calc(72px + env(safe-area-inset-top, 0px))',
    left: 0, right: 0,
    bottom: 'calc(210px + env(safe-area-inset-bottom, 0px))',
    zIndex: 2,
    background: 'transparent',
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    cursor: 'crosshair',
  },
  torchBtn: {
    position: 'absolute', top: 'calc(14px + env(safe-area-inset-top, 0px))', left: 14,
    width: 44, height: 44,
    borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
    cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    transition: 'background 0.18s ease, border-color 0.18s ease, color 0.18s ease',
  },
  torchBtnOn: {
    background: 'rgba(255,214,74,0.22)',
    borderColor: 'rgba(255,214,74,0.7)',
    color: '#ffd64a',
    boxShadow: '0 0 22px rgba(255,214,74,0.35)',
  },
  recBadge: {
    position: 'absolute', top: 'calc(18px + env(safe-area-inset-top, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    zIndex: 10, display: 'flex', alignItems: 'center', gap: 8,
    pointerEvents: 'none',
    padding: '6px 14px', background: 'rgba(255,51,102,0.2)',
    border: '1px solid #ff3366', borderRadius: 999,
    color: '#ff6688', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'ui-monospace, monospace',
  },
  recDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#ff3366',
    boxShadow: '0 0 10px #ff3366', animation: 'pulse-ring 1s ease infinite',
  },
  errorPanel: {
    position: 'absolute', inset: 0, zIndex: 15, background: 'rgba(0,0,0,0.88)',
    pointerEvents: 'auto',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: 'center', padding: 32, textAlign: 'center', gap: 16,
  },
  errorTitle: {
    fontSize: '0.7rem', letterSpacing: '0.25em', textTransform: 'uppercase',
    color: '#ff6688', fontWeight: 700,
  },
  errorMsg: {
    fontSize: '0.85rem', color: '#e8e8f0', lineHeight: 1.6, maxWidth: 340,
  },
  errorBtnRow: { display: 'flex', gap: 10, marginTop: 8 },
  loadingOverlay: {
    position: 'absolute', inset: 0, zIndex: 8, display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 14, background: 'rgba(0,0,0,0.5)', pointerEvents: 'none',
  },
  loadingSpinner: {
    width: 32, height: 32, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.2)', borderTopColor: '#00f0ff',
    animation: 'spin 0.9s linear infinite',
  },
  loadingText: {
    fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
  },
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 8,
    padding: '18px 24px calc(34px + env(safe-area-inset-bottom, 0px))',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 60%, transparent)',
    display: 'flex', flexDirection: 'column', gap: 16,
    pointerEvents: 'auto',
  },
  modeRow: {
    display: 'flex', justifyContent: 'center', gap: 6,
    pointerEvents: 'auto',
  },
  modeBtn: {
    padding: '8px 18px', background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 999, fontFamily: 'inherit', fontSize: '0.7rem',
    letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'auto',
  },
  modeBtnActive: {
    background: 'rgba(0,240,255,0.14)', borderColor: 'rgba(0,240,255,0.5)',
    color: '#00f0ff',
  },
  actionRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 20,
  },
  sideSlot: { width: 68 },
  shutter: {
    width: 76, height: 76, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '3px solid #fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', padding: 0, flexShrink: 0,
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  shutterRecording: { borderColor: '#ff3366' },
  shutterInner: {
    width: 60, height: 60, borderRadius: '50%', background: '#fff',
    transition: 'all 0.15s',
  },
  shutterCircleRed: { background: '#ff3366', width: 58, height: 58 },
  shutterSquare: { background: '#ff3366', width: 28, height: 28, borderRadius: 6 },
  flipBtn: {
    width: 68, height: 68, borderRadius: '50%',
    background: 'rgba(0,240,255,0.1)', color: '#00f0ff',
    border: '1.5px solid rgba(0,240,255,0.4)', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 2, padding: 0, flexShrink: 0,
    boxShadow: '0 0 20px rgba(0,240,255,0.15)',
    pointerEvents: 'auto',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  flipLabel: {
    fontSize: '0.5rem', letterSpacing: '0.08em', textTransform: 'uppercase',
    fontWeight: 600, opacity: 0.85,
  },
  previewActions: {
    display: 'flex', gap: 12, justifyContent: 'center',
    pointerEvents: 'auto',
  },
  btnGhost: {
    padding: '12px 24px', background: 'rgba(255,255,255,0.08)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 999, fontFamily: 'inherit', fontSize: '0.78rem',
    letterSpacing: '0.08em', cursor: 'pointer', minWidth: 120,
    pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  btnPrimary: {
    padding: '12px 24px', background: '#00ff88', color: '#05050f',
    border: 'none', borderRadius: 999, fontFamily: 'inherit', fontSize: '0.78rem',
    fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', minWidth: 120,
    pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
};
