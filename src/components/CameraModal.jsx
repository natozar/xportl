import React, { useEffect, useRef, useState, useCallback } from 'react';
import { preloadNsfwModel } from '../services/nsfwFilter';

const MAX_VIDEO_SECONDS = 15;
const MAX_IMAGE_DIMENSION = 1600;      // px on the longer side
const IMAGE_QUALITY = 0.82;            // webp quality after resize
const VIDEO_BITRATE = 1_500_000;       // 1.5 Mbps ≈ 2.8 MB for 15s
const AUDIO_BITRATE = 64_000;          // 64 kbps
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;  // 5 MB hard cap

// Resize + re-encode a source canvas so large phone captures don't bloat
// Storage. Returns { previewUrl, blob } or rejects if blob > MAX_UPLOAD_BYTES.
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

    const previewUrl = out.toDataURL('image/webp', IMAGE_QUALITY);
    out.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Falha ao codificar imagem'));
        if (blob.size > MAX_UPLOAD_BYTES) {
          return reject(new Error('Imagem muito grande mesmo apos compressao'));
        }
        resolve({ previewUrl, blob });
      },
      'image/webp',
      IMAGE_QUALITY
    );
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
    .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
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

  // Warm up the NSFW classifier while the user is framing the shot so the
  // confirmation step doesn't stall for 3-5 seconds on the first scan.
  useEffect(() => { preloadNsfwModel(); }, []);

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

        const videoConstraints = mode === 'video'
          ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
          : { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } };

        const stream = await requestStreamWithRetry({ video: videoConstraints, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
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
    setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  }, []);

  const toggleMode = useCallback(() => {
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
      const recorder = new MediaRecorder(recStream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm',
        videoBitsPerSecond: VIDEO_BITRATE,
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
        if (blob.size > MAX_UPLOAD_BYTES) {
          setError(`Video muito grande (${(blob.size / 1024 / 1024).toFixed(1)} MB). Limite: 5 MB.`);
          chunksRef.current = [];
          setPreview(null);
          return;
        }
        const previewUrl = URL.createObjectURL(blob);
        setPreview({ blob, type: 'video', previewUrl });
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

          <button style={s.closeBtn} onClick={onClose} aria-label="Fechar">×</button>

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
              <button
                style={{ ...s.modeBtn, ...(mode === 'video' ? s.modeBtnActive : {}) }}
                onClick={() => !recording && setMode('video')}
                disabled={recording}
              >
                video 15s
              </button>
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
  },
  video: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', background: '#000',
  },
  previewMedia: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'contain', background: '#000',
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14, width: 40, height: 40,
    borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontSize: '1.5rem',
    cursor: 'pointer', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1,
  },
  recBadge: {
    position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
    zIndex: 3, display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 14px', background: 'rgba(255,51,102,0.2)',
    border: '1px solid #ff3366', borderRadius: 999,
    color: '#ff6688', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'ui-monospace, monospace',
  },
  recDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#ff3366',
    boxShadow: '0 0 10px #ff3366', animation: 'pulse-ring 1s ease infinite',
  },
  errorPanel: {
    position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(0,0,0,0.88)',
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
    position: 'absolute', inset: 0, zIndex: 4, display: 'flex',
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
    position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2,
    padding: '18px 24px calc(34px + env(safe-area-inset-bottom, 0px))',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  modeRow: {
    display: 'flex', justifyContent: 'center', gap: 6,
  },
  modeBtn: {
    padding: '8px 18px', background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 999, fontFamily: 'inherit', fontSize: '0.7rem',
    letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
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
  },
  flipLabel: {
    fontSize: '0.5rem', letterSpacing: '0.08em', textTransform: 'uppercase',
    fontWeight: 600, opacity: 0.85,
  },
  previewActions: {
    display: 'flex', gap: 12, justifyContent: 'center',
  },
  btnGhost: {
    padding: '12px 24px', background: 'rgba(255,255,255,0.08)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 999, fontFamily: 'inherit', fontSize: '0.78rem',
    letterSpacing: '0.08em', cursor: 'pointer', minWidth: 120,
  },
  btnPrimary: {
    padding: '12px 24px', background: '#00ff88', color: '#05050f',
    border: 'none', borderRadius: 999, fontFamily: 'inherit', fontSize: '0.78rem',
    fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer', minWidth: 120,
  },
};
