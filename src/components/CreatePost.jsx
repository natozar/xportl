import React, { useState, useEffect, useRef, useCallback } from 'react';
import { preloadNsfwModel, classifyImage } from '../services/nsfwFilter';

const MAX_CAPTION = 280;

/**
 * CreatePost — Instagram/TikTok-grade creation experience.
 *
 * Flow:
 * 1. Opens fullscreen camera immediately
 * 2. User captures photo (fills entire screen)
 * 3. Photo stays as background, caption field appears at bottom
 * 4. Side icons for options (ghost, lock, type)
 * 5. "Publicar" button posts everything
 */
export default function CreatePost({ onPost, onClose, saving }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const [phase, setPhase] = useState('camera'); // camera | preview | posting
  const [facing, setFacing] = useState('environment');
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [caption, setCaption] = useState('');
  const [capsuleType, setCapsuleType] = useState('perpetual');
  const [timeLock, setTimeLock] = useState(false);
  const [nsfwBlocked, setNsfwBlocked] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);

  // Preload NSFW model
  useEffect(() => { preloadNsfwModel(); }, []);

  // Open camera
  useEffect(() => {
    if (phase !== 'camera') return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.setAttribute('playsinline', '');
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err) {
        console.error('[XPortl] Camera failed:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [phase, facing]);

  // Capture photo
  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (facing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    const dataUrl = canvas.toDataURL('image/webp', 0.92);

    // NSFW check
    try {
      const result = await classifyImage(dataUrl);
      if (result.blocked) {
        setNsfwBlocked(true);
        if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        setTimeout(() => { setNsfwBlocked(false); setPhase('camera'); }, 3000);
        return;
      }
    } catch (_) {}

    const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', 0.88));
    setPhotoUrl(dataUrl);
    setPhotoBlob(blob);
    setPhase('preview');
    if (navigator.vibrate) navigator.vibrate(15);
  }, [facing]);

  // Flip camera
  const flip = () => setFacing(f => f === 'environment' ? 'user' : 'environment');

  // Retake
  const retake = () => {
    setPhotoUrl(null);
    setPhotoBlob(null);
    setCaption('');
    setPhase('camera');
  };

  // Post
  const handlePost = () => {
    if (saving) return;
    setPhase('posting');

    let unlockDate = null;
    if (timeLock) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      unlockDate = tomorrow.toISOString();
    }

    onPost({
      unlockDate,
      message: caption.trim() || '',
      mediaBlob: photoBlob,
      mediaType: photoBlob ? 'image' : null,
      viewsLeft: capsuleType === 'ghost' ? 10 : null,
      visibilityLayer: capsuleType === 'ghost' ? 'ghost' : capsuleType === 'private' ? 'private' : 'public',
    });
  };

  // Post without photo (text only)
  const handleTextPost = () => {
    if (saving || !caption.trim()) return;
    setPhase('posting');

    let unlockDate = null;
    if (timeLock) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      unlockDate = tomorrow.toISOString();
    }

    onPost({
      unlockDate,
      message: caption.trim(),
      mediaBlob: null,
      mediaType: null,
      viewsLeft: capsuleType === 'ghost' ? 10 : null,
      visibilityLayer: capsuleType === 'ghost' ? 'ghost' : capsuleType === 'private' ? 'private' : 'public',
    });
  };

  // ── NSFW BLOCKED ──
  if (nsfwBlocked) {
    return (
      <div style={st.fullscreen}>
        <div style={st.nsfwOverlay}>
          <span style={{ fontSize: '3rem' }}>🚫</span>
          <p style={st.nsfwText}>Conteudo inadequado detectado</p>
        </div>
      </div>
    );
  }

  // ── CAMERA PHASE ──
  if (phase === 'camera') {
    return (
      <div style={st.fullscreen}>
        <video
          ref={videoRef}
          style={{ ...st.fullVideo, transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
          playsInline
          muted
        />

        {/* Close */}
        <button style={st.topClose} onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="6" x2="18" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="6" x2="6" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Skip photo (text-only post) */}
        <button style={st.skipBtn} onClick={() => setPhase('preview')}>
          Aa Texto
        </button>

        {/* Bottom controls */}
        <div style={st.cameraBottom}>
          {/* Flip */}
          <button style={st.circleBtn} onClick={flip}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 10a8 8 0 0114-5" />
              <path d="M20 14a8 8 0 01-14 5" />
              <polyline points="18 1 18 6 13 6" />
              <polyline points="6 23 6 18 11 18" />
            </svg>
          </button>

          {/* Shutter */}
          <button style={st.shutter} onClick={capture} disabled={!cameraReady}>
            <div style={st.shutterInner} />
          </button>

          {/* Placeholder for balance */}
          <div style={{ width: 48 }} />
        </div>
      </div>
    );
  }

  // ── PREVIEW / COMPOSE PHASE ──
  return (
    <div style={st.fullscreen}>
      {/* Photo background (full bleed, no crop) */}
      {photoUrl ? (
        <img src={photoUrl} alt="" style={st.fullPhoto} />
      ) : (
        <div style={st.textOnlyBg} />
      )}

      {/* Top bar */}
      <div style={st.topBar}>
        <button style={st.topBtn} onClick={retake}>
          {photoUrl ? 'Refazer' : 'Camera'}
        </button>
        <div style={{ flex: 1 }} />
        <button style={st.topClose} onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <line x1="6" y1="6" x2="18" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="6" x2="6" y2="18" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Side options */}
      <div style={st.sideOptions}>
        <SideBtn
          icon={capsuleType === 'ghost' ? '👻' : capsuleType === 'private' ? '🔒' : '🌐'}
          label={capsuleType === 'ghost' ? 'Ghost' : capsuleType === 'private' ? 'Privado' : 'Publico'}
          active={capsuleType !== 'perpetual'}
          onClick={() => {
            const order = ['perpetual', 'ghost', 'private'];
            const i = order.indexOf(capsuleType);
            setCapsuleType(order[(i + 1) % order.length]);
          }}
        />
        <SideBtn
          icon={timeLock ? '⏳' : '⏰'}
          label={timeLock ? 'Amanha' : 'Agora'}
          active={timeLock}
          onClick={() => setTimeLock(!timeLock)}
        />
      </div>

      {/* Bottom compose area */}
      <div style={st.composeArea}>
        {/* Caption */}
        <div style={st.captionWrap}>
          <textarea
            style={st.captionInput}
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
            placeholder="Escreva uma legenda..."
            rows={2}
            maxLength={MAX_CAPTION}
          />
          <span style={st.charCount}>{caption.length}/{MAX_CAPTION}</span>
        </div>

        {/* Post button */}
        <button
          style={{ ...st.postBtn, opacity: (saving || phase === 'posting') ? 0.5 : 1 }}
          onClick={photoUrl ? handlePost : handleTextPost}
          disabled={saving || phase === 'posting' || (!photoUrl && !caption.trim())}
        >
          {phase === 'posting' ? 'Publicando...' : 'Publicar'}
        </button>
      </div>
    </div>
  );
}

function SideBtn({ icon, label, active, onClick }) {
  return (
    <button style={{ ...st.sideBtn, ...(active ? st.sideBtnActive : {}) }} onClick={onClick}>
      <span style={{ fontSize: '1.2rem' }}>{icon}</span>
      <span style={st.sideBtnLabel}>{label}</span>
    </button>
  );
}

const st = {
  fullscreen: {
    position: 'fixed', inset: 0, zIndex: 10003,
    background: '#000', pointerEvents: 'auto',
  },
  fullVideo: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'cover', pointerEvents: 'none',
  },
  fullPhoto: {
    position: 'absolute', inset: 0, width: '100%', height: '100%',
    objectFit: 'contain', background: '#0a0a14', pointerEvents: 'none',
  },
  textOnlyBg: {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(135deg, #0d0a1a 0%, #1a1040 100%)',
  },

  // Top
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    padding: 'calc(12px + env(safe-area-inset-top, 0px)) 14px 10px',
    display: 'flex', alignItems: 'center', gap: 8,
  },
  topClose: {
    width: 40, height: 40, borderRadius: '50%',
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  topBtn: {
    padding: '8px 16px', borderRadius: 20,
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: 'none', color: '#fff', fontSize: '0.75rem', fontWeight: 600,
    fontFamily: 'inherit', pointerEvents: 'auto', touchAction: 'manipulation',
  },
  skipBtn: {
    position: 'absolute', top: 'calc(16px + env(safe-area-inset-top, 0px))', left: 14, zIndex: 5,
    padding: '8px 16px', borderRadius: 20,
    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: 'none', color: '#fff', fontSize: '0.75rem', fontWeight: 600,
    fontFamily: 'inherit', pointerEvents: 'auto', touchAction: 'manipulation',
  },

  // Camera bottom
  cameraBottom: {
    position: 'absolute', left: 0, right: 0,
    bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    padding: '0 32px', pointerEvents: 'auto',
  },
  circleBtn: {
    width: 48, height: 48, borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)', border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  shutter: {
    width: 76, height: 76, borderRadius: '50%',
    background: 'none', border: '4px solid #fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    pointerEvents: 'auto', touchAction: 'manipulation',
  },
  shutterInner: {
    width: 62, height: 62, borderRadius: '50%', background: '#fff',
  },

  // Side options (right side, vertical)
  sideOptions: {
    position: 'absolute', right: 12, top: '35%', zIndex: 5,
    display: 'flex', flexDirection: 'column', gap: 10,
    pointerEvents: 'auto',
  },
  sideBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
    width: 56, padding: '8px 0', borderRadius: 14,
    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: '#fff', pointerEvents: 'auto', touchAction: 'manipulation',
  },
  sideBtnActive: {
    background: 'rgba(0,240,255,0.15)', borderColor: 'rgba(0,240,255,0.3)',
  },
  sideBtnLabel: {
    fontSize: '0.48rem', fontWeight: 600, letterSpacing: '0.05em', opacity: 0.7,
  },

  // Bottom compose
  composeArea: {
    position: 'absolute', left: 0, right: 0,
    bottom: 0, zIndex: 5,
    padding: '0 14px calc(14px + env(safe-area-inset-bottom, 0px))',
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 70%, transparent)',
    pointerEvents: 'auto',
  },
  captionWrap: {
    position: 'relative', marginBottom: 10,
  },
  captionInput: {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', fontSize: '0.88rem', fontFamily: 'inherit',
    resize: 'none', outline: 'none',
    WebkitAppearance: 'none',
  },
  charCount: {
    position: 'absolute', right: 12, bottom: 8,
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.25)',
  },
  postBtn: {
    width: '100%', padding: '15px', borderRadius: 16,
    background: '#00f0ff', border: 'none',
    color: '#05050f', fontSize: '0.92rem', fontWeight: 700,
    fontFamily: 'inherit', letterSpacing: '0.03em',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'auto',
  },

  // NSFW
  nsfwOverlay: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 12,
    background: 'rgba(255,0,0,0.1)',
  },
  nsfwText: {
    color: '#ff3366', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.1em',
  },
};
