import React, { useState } from 'react';
import { useMediaCapture } from '../hooks/useMediaCapture';
import { preloadNsfwModel } from '../services/nsfwFilter';

const GHOST_VIEW_OPTIONS = [5, 10, 50];

// Capsule types
const TYPES = {
  perpetual: { key: 'perpetual', label: 'Perpetua', desc: 'Fica no mapa para sempre', color: '#00ff88', rgb: '0,255,136', layer: 'public', viewsLeft: null },
  ghost:    { key: 'ghost',    label: 'Ghost',    desc: 'Autodestroe apos X views',  color: '#b44aff', rgb: '180,74,255', layer: 'ghost', viewsLeft: 10 },
  private:  { key: 'private',  label: 'Privada',  desc: 'So visivel por link direto', color: '#00e5ff', rgb: '0,229,255', layer: 'private', viewsLeft: null },
};

export default function LeaveTraceButton({ onPress, saving }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [capsuleType, setCapsuleType] = useState('perpetual');
  const [ghostViews, setGhostViews] = useState(10);
  const { media, recording, scanning, moderationError, capturePhoto, startAudioRecording, stopAudioRecording, clearMedia, dismissModerationError } = useMediaCapture();

  const currentType = TYPES[capsuleType];

  const handleCreate = async (lockUntilTomorrow) => {
    if (saving) return;

    setFeedback('saving');
    setPanelOpen(false);

    let unlockDate = null;
    if (lockUntilTomorrow) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      unlockDate = tomorrow.toISOString();
    }

    await onPress({
      unlockDate,
      mediaBlob: media?.blob || null,
      mediaType: media?.type || null,
      viewsLeft: capsuleType === 'ghost' ? ghostViews : null,
      visibilityLayer: currentType.layer,
    });

    clearMedia();
    setCapsuleType('perpetual');
    setGhostViews(10);
    setFeedback('done');
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleClose = () => {
    setPanelOpen(false);
    clearMedia();
    setCapsuleType('perpetual');
  };

  return (
    <>
      {/* Toast */}
      {feedback && (
        <div style={st.toast}>
          <div style={st.toastInner}>
            {feedback === 'saving' ? (
              <><div style={st.miniSpinner} /><span>Ancorando...</span></>
            ) : (
              <><span style={{ color: '#00ff88' }}>&#x2713;</span><span>Capsula ancorada</span></>
            )}
          </div>
        </div>
      )}

      {/* Creation panel */}
      {panelOpen && (
        <div style={st.backdrop} onClick={handleClose}>
          <div style={st.panel} onClick={(e) => e.stopPropagation()}>
            <div style={st.handle} />
            <h3 style={st.title}>PLANTAR CAPSULA</h3>

            {/* ── Capsule type selector ── */}
            <div style={st.sectionLabel}>TIPO DE CAPSULA</div>
            <div style={st.typeRow}>
              {Object.values(TYPES).map((t) => {
                const active = capsuleType === t.key;
                return (
                  <button
                    key={t.key}
                    style={{
                      ...st.typeBtn,
                      ...(active ? {
                        background: `rgba(${t.rgb}, 0.1)`,
                        borderColor: `rgba(${t.rgb}, 0.35)`,
                        color: t.color,
                      } : {}),
                    }}
                    onClick={() => setCapsuleType(t.key)}
                  >
                    <div style={st.typeIcon}>
                      {t.key === 'perpetual' && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke={active ? t.color : 'currentColor'} strokeWidth="1.5" fill="none" />
                          <path d="M8 12l2.5 2.5L16 9" stroke={active ? t.color : 'currentColor'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {t.key === 'ghost' && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2C7 2 4 6 4 10v8c0 1 .5 2 1.5 2s1.5-1 2-1 1 1 2 1 1.5-1 2.5-1 1.5 1 2.5 1 1-1 2-1 1.5 2 2.5 2S20 19 20 18v-8c0-4-3-8-8-8z"
                            stroke={active ? t.color : 'currentColor'} strokeWidth="1.5" fill={active ? `rgba(${t.rgb}, 0.08)` : 'none'} />
                          <circle cx="9" cy="11" r="1.5" fill={active ? t.color : 'currentColor'} opacity="0.6" />
                          <circle cx="15" cy="11" r="1.5" fill={active ? t.color : 'currentColor'} opacity="0.6" />
                        </svg>
                      )}
                      {t.key === 'private' && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <rect x="5" y="11" width="14" height="10" rx="2" stroke={active ? t.color : 'currentColor'} strokeWidth="1.5" />
                          <path d="M8 11V7a4 4 0 118 0v4" stroke={active ? t.color : 'currentColor'} strokeWidth="1.5" />
                          <circle cx="12" cy="16" r="1.5" fill={active ? t.color : 'currentColor'} opacity="0.5" />
                        </svg>
                      )}
                    </div>
                    <span style={st.typeName}>{t.label}</span>
                    {active && <div style={{ ...st.activeIndicator, background: t.color }} />}
                  </button>
                );
              })}
            </div>

            {/* Type description */}
            <div style={{ ...st.typeDesc, color: `rgba(${currentType.rgb}, 0.6)` }}>
              {currentType.desc}
            </div>

            {/* ── Ghost views selector (only when Ghost selected) ── */}
            {capsuleType === 'ghost' && (
              <div style={st.ghostSection}>
                <div style={st.ghostLabel}>AUTODESTROI APOS</div>
                <div style={st.ghostViewsRow}>
                  {GHOST_VIEW_OPTIONS.map((v) => (
                    <button
                      key={v}
                      style={{
                        ...st.ghostViewBtn,
                        ...(ghostViews === v ? st.ghostViewBtnActive : {}),
                      }}
                      onClick={() => setGhostViews(v)}
                    >
                      <span style={st.ghostViewNum}>{v}</span>
                      <span style={st.ghostViewUnit}>views</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── NSFW / Moderation alert ── */}
            {moderationError && (
              <div style={st.nsfwAlert}>
                <div style={st.nsfwAlertHeader}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 22h20L12 2z" stroke="#ff3366" strokeWidth="1.5" fill="rgba(255,51,102,0.1)" />
                    <line x1="12" y1="9" x2="12" y2="14" stroke="#ff3366" strokeWidth="2" strokeLinecap="round" />
                    <circle cx="12" cy="17" r="1" fill="#ff3366" />
                  </svg>
                  <span style={st.nsfwAlertTitle}>CONTEUDO BLOQUEADO</span>
                  <button style={st.nsfwDismiss} onClick={dismissModerationError}>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
                <p style={st.nsfwAlertText}>{moderationError}</p>
              </div>
            )}

            {/* ── AI Scanning indicator ── */}
            {scanning && (
              <div style={st.scanningBar}>
                <div style={st.scanningSpinner} />
                <span style={st.scanningText}>Escaneando imagem com IA...</span>
              </div>
            )}

            {/* ── Media attachments ── */}
            <div style={st.sectionLabel}>ANEXAR MIDIA</div>
            <div style={st.mediaRow}>
              <button style={{ ...st.mediaBtn, ...(scanning ? { opacity: 0.4, pointerEvents: 'none' } : {}) }} onClick={capturePhoto}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="2" y="6" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="13" r="1.5" fill="currentColor" opacity="0.4" />
                </svg>
                <span>Foto</span>
              </button>
              {recording ? (
                <button style={{ ...st.mediaBtn, ...st.mediaBtnActive }} onClick={stopAudioRecording}>
                  <div style={st.recDot} />
                  <span>Parar</span>
                </button>
              ) : (
                <button style={st.mediaBtn} onClick={startAudioRecording}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 12a7 7 0 0014 0" stroke="currentColor" strokeWidth="1.5" />
                    <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  <span>Audio</span>
                </button>
              )}
            </div>

            {/* Media preview */}
            {media && (
              <div style={st.preview}>
                {media.type === 'image' ? (
                  <img src={media.preview} alt="Preview" style={st.previewImg} />
                ) : (
                  <div style={st.audioPreview}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <polygon points="8,5 19,12 8,19" fill="#00ff88" opacity="0.6" />
                    </svg>
                    <span style={st.audioLabel}>Audio gravado</span>
                  </div>
                )}
                <button style={st.removeMedia} onClick={clearMedia}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Time / Send ── */}
            <div style={st.timeRow}>
              <button style={st.timeBtn} onClick={() => handleCreate(false)}>
                <span style={st.timeDot} />
                Abrir agora
              </button>
              <button style={{ ...st.timeBtn, ...st.timeBtnLock }} onClick={() => handleCreate(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 11V7a4 4 0 118 0v4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                Travar ate amanha
              </button>
            </div>

            <button style={st.cancelBtn} onClick={handleClose}>Cancelar</button>
          </div>
        </div>
      )}

      {/* FAB */}
      {!panelOpen && !feedback && (
        <button style={st.fab} onClick={() => { setPanelOpen(true); preloadNsfwModel(); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </>
  );
}

const st = {
  fab: {
    position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
    zIndex: 35, pointerEvents: 'auto', width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(0,255,136,0.12)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(0,255,136,0.3)', color: '#00ff88',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 30px rgba(0,255,136,0.15)',
  },
  toast: {
    position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
    zIndex: 40, pointerEvents: 'none',
  },
  toastInner: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
    background: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0,255,136,0.15)', borderRadius: 50,
    color: '#00ff88', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
  },
  miniSpinner: {
    width: 14, height: 14, border: '2px solid rgba(0,255,136,0.15)',
    borderTopColor: '#00ff88', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
  },
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'auto',
  },
  panel: {
    width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto',
    background: 'rgba(14,14,20,0.92)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
    borderTop: '1px solid rgba(255,255,255,0.06)', borderRadius: '20px 20px 0 0',
    padding: '12px 20px 32px',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)',
    margin: '0 auto 14px',
  },
  title: {
    fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'var(--text-primary)', margin: '0 0 16px',
  },
  sectionLabel: {
    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'rgba(255,255,255,0.2)', marginBottom: 8,
  },

  // ── Type selector ──
  typeRow: {
    display: 'flex', gap: 6, marginBottom: 6,
  },
  typeBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    padding: '12px 6px 10px', background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14,
    color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit',
    position: 'relative', overflow: 'hidden', transition: 'all 0.2s ease',
  },
  typeIcon: {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  typeName: {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em',
  },
  activeIndicator: {
    position: 'absolute', bottom: 0, left: '20%', right: '20%',
    height: 2, borderRadius: '2px 2px 0 0',
  },
  typeDesc: {
    fontSize: '0.55rem', fontWeight: 500, marginBottom: 14, paddingLeft: 2,
  },

  // ── Ghost views selector ──
  ghostSection: {
    padding: '10px 12px', background: 'rgba(180,74,255,0.03)',
    border: '1px solid rgba(180,74,255,0.08)', borderRadius: 12,
    marginBottom: 14,
  },
  ghostLabel: {
    fontSize: '0.48rem', fontWeight: 700, letterSpacing: '0.2em',
    color: 'rgba(180,74,255,0.5)', marginBottom: 8,
  },
  ghostViewsRow: {
    display: 'flex', gap: 6,
  },
  ghostViewBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 4px', background: 'rgba(180,74,255,0.03)',
    border: '1px solid rgba(180,74,255,0.08)', borderRadius: 10,
    color: 'rgba(180,74,255,0.4)', fontFamily: 'inherit', transition: 'all 0.15s',
  },
  ghostViewBtnActive: {
    background: 'rgba(180,74,255,0.1)', borderColor: 'rgba(180,74,255,0.3)',
    color: '#b44aff', boxShadow: '0 0 12px rgba(180,74,255,0.1)',
  },
  ghostViewNum: {
    fontSize: '1rem', fontWeight: 700,
  },
  ghostViewUnit: {
    fontSize: '0.45rem', fontWeight: 600, letterSpacing: '0.1em', opacity: 0.6,
  },

  // ── Media row ──
  mediaRow: {
    display: 'flex', gap: 8, marginBottom: 12,
  },
  mediaBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '10px 8px', background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
    color: 'rgba(255,255,255,0.5)', fontSize: '0.55rem', fontWeight: 600,
    fontFamily: 'inherit', letterSpacing: '0.05em',
  },
  mediaBtnActive: {
    background: 'rgba(255,51,102,0.1)', borderColor: 'rgba(255,51,102,0.3)', color: '#ff3366',
  },
  recDot: {
    width: 10, height: 10, borderRadius: '50%', background: '#ff3366',
    boxShadow: '0 0 8px rgba(255,51,102,0.6)', animation: 'pulse-ring 1s ease infinite',
  },

  // ── NSFW alert ──
  nsfwAlert: {
    padding: '12px 14px', marginBottom: 12, borderRadius: 12,
    background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.2)',
  },
  nsfwAlertHeader: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
  },
  nsfwAlertTitle: {
    flex: 1, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.15em', color: '#ff3366',
  },
  nsfwDismiss: {
    background: 'none', border: 'none', color: 'rgba(255,51,102,0.4)', padding: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  nsfwAlertText: {
    fontSize: '0.65rem', color: 'rgba(255,51,102,0.7)', lineHeight: 1.6,
  },

  // ── Scanning bar ──
  scanningBar: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    marginBottom: 12, borderRadius: 10,
    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.1)',
  },
  scanningSpinner: {
    width: 14, height: 14, border: '2px solid rgba(0,240,255,0.15)',
    borderTopColor: '#00f0ff', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
    flexShrink: 0,
  },
  scanningText: {
    fontSize: '0.62rem', color: 'rgba(0,240,255,0.6)', fontWeight: 600,
  },

  // ── Preview ──
  preview: {
    position: 'relative', marginBottom: 12, borderRadius: 12, overflow: 'hidden',
    border: '1px solid rgba(0,255,136,0.1)',
  },
  previewImg: { width: '100%', height: 140, objectFit: 'cover', display: 'block' },
  audioPreview: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
    background: 'rgba(0,255,136,0.03)',
  },
  audioLabel: { fontSize: '0.65rem', color: '#00ff88', fontWeight: 600 },
  removeMedia: {
    position: 'absolute', top: 6, right: 6, width: 24, height: 24,
    borderRadius: '50%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
    border: 'none', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  // ── Time buttons ──
  timeRow: { display: 'flex', gap: 8, marginBottom: 8 },
  timeBtn: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '13px 12px', background: 'rgba(0,255,136,0.06)',
    border: '1px solid rgba(0,255,136,0.15)', borderRadius: 12,
    color: '#00ff88', fontSize: '0.68rem', fontWeight: 600, fontFamily: 'inherit',
  },
  timeBtnLock: {
    background: 'rgba(180,74,255,0.04)', borderColor: 'rgba(180,74,255,0.12)', color: '#b44aff',
  },
  timeDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#00ff88',
    boxShadow: '0 0 6px rgba(0,255,136,0.4)',
  },
  cancelBtn: {
    width: '100%', padding: '12px', background: 'transparent', border: 'none',
    color: 'var(--text-muted)', fontSize: '0.7rem', fontFamily: 'inherit', marginTop: 4,
  },
};
