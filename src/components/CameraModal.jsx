import React, { useEffect, useRef, useState, useCallback } from 'react';

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
export default function CameraModal({ onClose, onCapture, initialMode = 'photo' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);

  const [facing, setFacing] = useState('environment');
  const [mode, setMode] = useState(initialMode);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState(null); // { blob, type, previewUrl }
  const [error, setError] = useState(null);

  // (re)open stream when facing changes
  useEffect(() => {
    if (preview) return; // paused in preview state
    let cancelled = false;

    (async () => {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        // Photo mode wants high res (we compress to 1600px after snap).
        // Video mode caps at 720p to keep 15s clips under ~3 MB encoded.
        const videoConstraints = mode === 'video'
          ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
          : { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: mode === 'video',
        });
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
      } catch (err) {
        setError(err.message || 'Camera bloqueada. Verifique as permissoes.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [facing, mode, preview]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (preview?.previewUrl && preview.type === 'video') {
        URL.revokeObjectURL(preview.previewUrl);
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

  const startVideo = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    try {
      const recorder = new MediaRecorder(streamRef.current, {
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

  return (
    <div style={s.backdrop}>
      {error && (
        <div style={s.errorBar}>
          <span>{error}</span>
          <button style={s.errorClose} onClick={onClose}>×</button>
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
                }}
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
                style={s.flipBtn}
                onClick={toggleFacing}
                disabled={recording}
                aria-label="Virar camera"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
                  <path d="M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0" />
                  <path d="M12 4v3M12 17v3" />
                </svg>
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
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
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
  errorBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 4,
    padding: '14px 18px', background: '#1a0a14', color: '#ff6688',
    borderBottom: '1px solid #ff3366', display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', fontSize: '0.75rem',
  },
  errorClose: {
    background: 'none', border: 'none', color: '#ff6688', fontSize: '1.2rem',
    cursor: 'pointer', padding: 4,
  },
  bottomBar: {
    position: 'relative', zIndex: 2, padding: '18px 24px 34px',
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
  sideSlot: { width: 52 },
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
    width: 52, height: 52, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.18)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
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
