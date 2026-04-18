import { useState, useEffect, useRef } from 'react';
import { useMediaCapture } from '../hooks/useMediaCapture';
import { preloadNsfwModel } from '../services/nsfwFilter';
import { RARITIES, CAPSULE_TYPES, checkRarityLimit } from '../services/capsules';
import { calculateLevel } from '../services/gamification';
import { supabase } from '../services/supabase';
import CameraModal from './CameraModal';
import PlacementMode from './PlacementMode';

const GHOST_VIEW_OPTIONS = [5, 10, 50];
const MAX_MESSAGE = 280;

const VISIBILITY = [
  { key: 'public',  label: 'Publica',  icon: '🌍', color: '#00ff88', rgb: '0,255,136' },
  { key: 'ghost',   label: 'Ghost',    icon: '👻', color: '#b44aff', rgb: '180,74,255' },
  { key: 'private', label: 'Privada',  icon: '🔒', color: '#00e5ff', rgb: '0,229,255' },
];

const RARITY_LIST = Object.values(RARITIES);
const TYPE_LIST = Object.values(CAPSULE_TYPES);

export default function LeaveTraceButton({ onPress, saving }) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [step, setStep] = useState('compose'); // 'compose' | 'type'
  const [visIdx, setVisIdx] = useState(0);
  const [rarityIdx, setRarityIdx] = useState(0);
  const [typeIdx, setTypeIdx] = useState(0);
  const [ghostViews, setGhostViews] = useState(10);
  const [message, setMessage] = useState('');
  const [lockUntilTomorrow, setLockUntilTomorrow] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [userLevel, setUserLevel] = useState(1);
  const [userId, setUserId] = useState(null);
  const pendingDataRef = useRef(null);
  const inputRef = useRef(null);
  const { media, recording, scanning, moderationError, acceptCapturedMedia, startAudioRecording, stopAudioRecording, clearMedia, dismissModerationError } = useMediaCapture();

  // Load user level for rarity gating
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data?.user?.id) return;
      setUserId(data.user.id);
      supabase.from('user_profiles').select('xp').eq('id', data.user.id).single()
        .then(({ data: p }) => { if (p?.xp) setUserLevel(calculateLevel(p.xp)); });
    });
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(true); preloadNsfwModel(); };
    window.addEventListener('xportl:open-create', handler);
    return () => window.removeEventListener('xportl:open-create', handler);
  }, []);

  useEffect(() => {
    if (open && step === 'compose') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open, step]);

  const currentVis = VISIBILITY[visIdx];
  const currentRarity = RARITY_LIST[rarityIdx];
  const currentCType = TYPE_LIST[typeIdx];
  const isAdvancedChanged = rarityIdx !== 0 || typeIdx !== 0;

  const handleCreate = async () => {
    if (saving) return;

    // Rarity level gate
    if (userLevel < currentRarity.minLevel) {
      alert(`Voce precisa ser nivel ${currentRarity.minLevel} para criar capsulas ${currentRarity.label}. Seu nivel atual: ${userLevel}.`);
      return;
    }

    // Rarity daily limit
    if (currentRarity.dailyLimit) {
      const { allowed, used, limit } = await checkRarityLimit(userId, currentRarity.key);
      if (!allowed) {
        alert(`Limite diario atingido: ${used}/${limit} capsulas ${currentRarity.label} hoje.`);
        return;
      }
    }

    let unlockDate = null;
    if (lockUntilTomorrow) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      unlockDate = tomorrow.toISOString();
    }

    // Store pending data and enter placement mode
    pendingDataRef.current = {
      unlockDate,
      message: (message || '').trim() || 'Estive aqui!',
      mediaBlob: media?.blob || null,
      mediaType: media?.type || null,
      viewsLeft: currentVis.key === 'ghost' ? ghostViews : null,
      visibilityLayer: currentVis.key,
      rarity: currentRarity.key,
      capsuleType: currentCType.key,
      _rarity: currentRarity,
      _cType: currentCType,
    };

    setOpen(false);
    setPlacementMode(true);
  };

  const handlePlacementConfirm = async ({ headingDeg, pitchDeg, hintPhotoBlob }) => {
    setPlacementMode(false);
    const data = pendingDataRef.current;
    if (!data) return;
    pendingDataRef.current = null;

    setFeedback({ status: 'saving', rarity: data._rarity, cType: data._cType });

    await onPress({
      ...data,
      headingDeg,
      pitchDeg,
      hintPhotoBlob,
    });

    clearMedia();
    setVisIdx(0);
    setRarityIdx(0);
    setTypeIdx(0);
    setGhostViews(10);
    setMessage('');
    setLockUntilTomorrow(false);
    setStep('compose');
    setFeedback({ status: 'done', rarity: data._rarity, cType: data._cType });
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handlePlacementCancel = () => {
    setPlacementMode(false);
    pendingDataRef.current = null;
    setOpen(true); // reopen the sheet
  };

  const handleClose = () => {
    setOpen(false);
    clearMedia();
    setVisIdx(0);
    setRarityIdx(0);
    setTypeIdx(0);
    setMessage('');
    setLockUntilTomorrow(false);
    setStep('compose');
  };

  const hasContent = message.trim() || media;

  return (
    <>
      {/* ── Toast ── */}
      {feedback && (
        <div style={{
          ...st.toast,
          ...(feedback.rarity?.key !== 'common' ? { borderColor: `${feedback.rarity.color}33` } : {}),
        }}>
          {feedback.status === 'saving' ? (
            <><div style={st.miniSpin} /><span>Ancorando portal...</span></>
          ) : (
            <>
              <span style={{ color: feedback.rarity?.color || '#00ff88', fontSize: '1rem' }}>
                {feedback.rarity?.icon || '✦'}
              </span>
              <span>
                Portal {feedback.rarity?.key !== 'common' ? feedback.rarity.label : ''} criado!
                {feedback.cType?.key !== 'standard' ? ` (${feedback.cType.icon} ${feedback.cType.label})` : ''}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Bottom sheet ── */}
      {open && (
        <div style={st.backdrop} onClick={handleClose}>
          <div style={st.sheet} onClick={(e) => e.stopPropagation()}>
            <div style={st.handle} />

            <div style={st.header}>
              <span style={st.headerTitle}>Novo Portal</span>
              <button style={st.headerClose} onClick={handleClose}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {step === 'compose' ? (
              <>
                {/* Visibility pills */}
                <div style={st.typePills}>
                  {VISIBILITY.map((t, i) => {
                    const active = visIdx === i;
                    return (
                      <button
                        key={t.key}
                        style={{
                          ...st.pill,
                          ...(active ? { background: `rgba(${t.rgb}, 0.12)`, borderColor: `rgba(${t.rgb}, 0.3)`, color: t.color } : {}),
                        }}
                        onClick={() => setVisIdx(i)}
                      >
                        <span style={{ fontSize: '0.85rem' }}>{t.icon}</span>
                        <span style={st.pillLabel}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Ghost views */}
                {currentVis.key === 'ghost' && (
                  <div style={st.ghostRow}>
                    <span style={st.ghostLabel}>Autodestroe apos</span>
                    <div style={st.ghostBtns}>
                      {GHOST_VIEW_OPTIONS.map((v) => (
                        <button
                          key={v}
                          style={{
                            ...st.ghostBtn,
                            ...(ghostViews === v ? { background: 'rgba(180,74,255,0.15)', borderColor: 'rgba(180,74,255,0.35)', color: '#b44aff' } : {}),
                          }}
                          onClick={() => setGhostViews(v)}
                        >{v}</button>
                      ))}
                      <span style={st.ghostUnit}>views</span>
                    </div>
                  </div>
                )}

                {/* Rarity + Type toggle — highlighted when changed */}
                <button
                  style={{
                    ...st.advancedToggle,
                    ...(isAdvancedChanged ? {
                      borderColor: `${currentRarity.color}44`,
                      background: `${currentRarity.color}0a`,
                    } : {}),
                  }}
                  onClick={() => setStep('type')}
                >
                  <span style={{ color: currentRarity.color, fontWeight: isAdvancedChanged ? 700 : 600 }}>
                    {currentRarity.icon} {currentRarity.label}
                  </span>
                  <span style={st.advSep}>·</span>
                  <span style={isAdvancedChanged ? { color: '#00f0ff' } : {}}>
                    {currentCType.icon} {currentCType.label}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 'auto', opacity: 0.4 }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* ── NSFW alert ── */}
                {moderationError && (
                  <div style={st.nsfwBar}>
                    <span style={{ color: '#ff3366', fontSize: '0.7rem', fontWeight: 600, flex: 1 }}>⚠ {moderationError}</span>
                    <button style={{ background: 'none', border: 'none', color: '#ff3366', fontSize: '0.8rem', padding: 4 }} onClick={dismissModerationError}>✕</button>
                  </div>
                )}

                {scanning && (
                  <div style={st.scanBar}>
                    <div style={st.miniSpin} /><span style={{ fontSize: '0.65rem', color: 'rgba(0,240,255,0.6)' }}>Escaneando com IA...</span>
                  </div>
                )}

                {/* Media preview */}
                {media && (
                  <div style={st.mediaPreview}>
                    {media.type === 'image' && <img src={media.preview} alt="" style={st.previewThumb} />}
                    {media.type === 'video' && <video src={media.preview} style={st.previewThumb} muted playsInline autoPlay loop />}
                    {media.type === 'audio' && (
                      <div style={st.audioTag}>
                        <span style={{ fontSize: '1rem' }}>🎙</span>
                        <span style={{ fontSize: '0.65rem', color: '#00ff88', fontWeight: 600 }}>Audio gravado</span>
                      </div>
                    )}
                    <button style={st.removeMedia} onClick={clearMedia}>✕</button>
                  </div>
                )}

                {/* Compose area */}
                <div style={st.composeWrap}>
                  <textarea
                    ref={inputRef}
                    style={st.textarea}
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                    placeholder="O que voce quer deixar aqui?"
                    rows={2}
                  />
                  {message.length > 0 && (
                    <span style={st.charCount}>{message.length}/{MAX_MESSAGE}</span>
                  )}
                </div>

                {/* Action bar */}
                <div style={st.actionBar}>
                  <div style={st.mediaActions}>
                    <button style={{ ...st.iconBtn, ...(scanning ? { opacity: 0.3, pointerEvents: 'none' } : {}) }} onClick={() => setCameraOpen('photo')} title="Foto">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <rect x="2" y="6" width="20" height="14" rx="3" /><circle cx="12" cy="13" r="4" />
                      </svg>
                    </button>
                    <button style={{ ...st.iconBtn, ...(scanning ? { opacity: 0.3, pointerEvents: 'none' } : {}) }} onClick={() => setCameraOpen('video')} title="Video">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <rect x="2" y="6" width="14" height="12" rx="2" /><path d="M22 8l-6 4 6 4V8z" />
                      </svg>
                    </button>
                    {recording ? (
                      <button style={{ ...st.iconBtn, color: '#ff3366', borderColor: 'rgba(255,51,102,0.3)' }} onClick={stopAudioRecording}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff3366', boxShadow: '0 0 8px #ff3366' }} />
                      </button>
                    ) : (
                      <button style={st.iconBtn} onClick={startAudioRecording} title="Audio">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 12a7 7 0 0014 0" /><line x1="12" y1="19" x2="12" y2="22" />
                        </svg>
                      </button>
                    )}
                    <span style={st.divider} />
                    <button
                      style={{
                        ...st.iconBtn,
                        ...(lockUntilTomorrow ? { color: '#b44aff', borderColor: 'rgba(180,74,255,0.3)', background: 'rgba(180,74,255,0.08)' } : {}),
                      }}
                      onClick={() => setLockUntilTomorrow(!lockUntilTomorrow)}
                      title={lockUntilTomorrow ? 'Trancado ate amanha' : 'Travar ate amanha'}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                      </svg>
                      {lockUntilTomorrow && <span style={st.lockBadge}>amanha</span>}
                    </button>
                  </div>

                  <button
                    style={{
                      ...st.sendBtn,
                      background: hasContent ? `linear-gradient(135deg, ${currentVis.color}, ${currentVis.color}cc)` : 'rgba(255,255,255,0.06)',
                      color: hasContent ? '#0a0814' : 'rgba(255,255,255,0.2)',
                    }}
                    onClick={handleCreate}
                    disabled={saving || (!hasContent)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              /* ── Type selection step (no compose/media/action bar) ── */
              <>
                <button style={st.backToCompose} onClick={() => setStep('compose')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                  <span>Voltar</span>
                </button>

                {/* Rarity */}
                <div style={st.sectionLabel}>RARIDADE</div>
                <div style={st.rarityRow}>
                  {RARITY_LIST.map((r, i) => {
                    const active = rarityIdx === i;
                    const locked = userLevel < r.minLevel;
                    return (
                      <button
                        key={r.key}
                        style={{
                          ...st.rarityBtn,
                          ...(locked ? { opacity: 0.35 } : {}),
                          ...(active && !locked ? { background: `${r.color}18`, borderColor: `${r.color}55`, color: r.color } : {}),
                        }}
                        onClick={() => { if (!locked) setRarityIdx(i); }}
                        disabled={locked}
                      >
                        <span style={{ fontSize: '1rem' }}>{r.icon}</span>
                        <span style={st.rarityName}>{r.label}</span>
                        {locked && <span style={st.rarityLock}>Nv.{r.minLevel}</span>}
                        {!locked && r.dailyLimit && <span style={st.rarityLock}>{r.dailyLimit}/dia</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Capsule type */}
                <div style={st.sectionLabel}>TIPO DE CAPSULA</div>
                <div style={st.typeGrid}>
                  {TYPE_LIST.map((t, i) => {
                    const active = typeIdx === i;
                    return (
                      <button
                        key={t.key}
                        style={{
                          ...st.typeCard,
                          ...(active ? { borderColor: 'rgba(0,240,255,0.3)', background: 'rgba(0,240,255,0.06)' } : {}),
                        }}
                        onClick={() => setTypeIdx(i)}
                      >
                        <span style={{ fontSize: '1.2rem' }}>{t.icon}</span>
                        <span style={{ ...st.typeCardName, ...(active ? { color: '#00f0ff' } : {}) }}>{t.label}</span>
                        <span style={st.typeCardDesc}>{t.desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Confirm button on type step */}
                <button style={st.confirmTypeBtn} onClick={() => setStep('compose')}>
                  <span style={{ color: currentRarity.color }}>{currentRarity.icon} {currentRarity.label}</span>
                  <span style={{ opacity: 0.3 }}>·</span>
                  <span>{currentCType.icon} {currentCType.label}</span>
                  <span style={{ opacity: 0.4, marginLeft: 4 }}>— Confirmar</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Placement mode */}
      {placementMode && (
        <PlacementMode onConfirm={handlePlacementConfirm} onCancel={handlePlacementCancel} />
      )}

      {/* Camera modal */}
      {cameraOpen && (
        <CameraModal
          initialMode={cameraOpen}
          onClose={() => setCameraOpen(null)}
          onCapture={async (captured) => {
            setCameraOpen(null);
            await acceptCapturedMedia(captured);
          }}
        />
      )}

      {/* ── FAB ── */}
      {!open && !feedback && (
        <button style={st.fab} onClick={() => { setOpen(true); preloadNsfwModel(); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </>
  );
}

const st = {
  fab: {
    position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    zIndex: 35, pointerEvents: 'auto', width: 56, height: 56, borderRadius: '50%',
    background: 'linear-gradient(135deg, #00f0ff, #b44aff)',
    border: 'none', color: '#0a0814',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 20px rgba(0,240,255,0.3), 0 8px 32px rgba(180,74,255,0.2)',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  toast: {
    position: 'fixed', bottom: 'calc(140px + env(safe-area-inset-bottom, 0px))',
    left: '50%', transform: 'translateX(-50%)',
    zIndex: 40, pointerEvents: 'none',
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
    background: 'rgba(10,8,20,0.9)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0,255,136,0.15)', borderRadius: 50,
    color: '#00ff88', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap',
  },
  miniSpin: {
    width: 14, height: 14, border: '2px solid rgba(0,240,255,0.15)',
    borderTopColor: '#00f0ff', borderRadius: '50%', animation: 'spin 0.6s linear infinite',
    flexShrink: 0,
  },
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60,
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center', pointerEvents: 'auto',
  },
  sheet: {
    width: '100%', maxWidth: 500, maxHeight: '85vh', overflowY: 'auto',
    background: '#0e0b18',
    borderRadius: '24px 24px 0 0',
    padding: '6px 18px calc(16px + env(safe-area-inset-bottom, 0px))',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.04)', borderBottom: 'none',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    background: 'rgba(255,255,255,0.12)', margin: '0 auto 12px',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
  },
  headerTitle: { fontSize: '1rem', fontWeight: 700, color: '#f0f0f8', letterSpacing: '0.02em' },
  headerClose: {
    width: 32, height: 32, borderRadius: 10,
    background: 'rgba(255,255,255,0.06)', border: 'none', color: 'rgba(255,255,255,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
  },
  typePills: { display: 'flex', gap: 8, marginBottom: 14 },
  pill: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '10px 8px', borderRadius: 14,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.4)', fontFamily: 'inherit', fontSize: '0.7rem',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', transition: 'all 0.2s',
  },
  pillLabel: { fontWeight: 600, letterSpacing: '0.02em' },
  ghostRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', marginBottom: 12, borderRadius: 12,
    background: 'rgba(180,74,255,0.04)', border: '1px solid rgba(180,74,255,0.08)',
  },
  ghostLabel: { fontSize: '0.6rem', color: 'rgba(180,74,255,0.5)', fontWeight: 600, letterSpacing: '0.06em', whiteSpace: 'nowrap' },
  ghostBtns: { display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' },
  ghostBtn: {
    padding: '5px 12px', borderRadius: 8,
    background: 'rgba(180,74,255,0.04)', border: '1px solid rgba(180,74,255,0.1)',
    color: 'rgba(180,74,255,0.4)', fontSize: '0.75rem', fontWeight: 700,
    fontFamily: 'inherit', touchAction: 'manipulation',
  },
  ghostUnit: { fontSize: '0.5rem', color: 'rgba(180,74,255,0.35)', fontWeight: 600, letterSpacing: '0.08em', marginLeft: 2 },
  advancedToggle: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', marginBottom: 12, borderRadius: 12,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600,
    fontFamily: 'inherit', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    transition: 'all 0.2s',
  },
  advSep: { color: 'rgba(255,255,255,0.15)' },
  backToCompose: {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14,
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
    fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit', padding: 0, touchAction: 'manipulation',
  },
  sectionLabel: {
    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.2)', marginBottom: 8, textTransform: 'uppercase',
  },
  rarityRow: { display: 'flex', gap: 6, marginBottom: 16 },
  rarityBtn: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '10px 4px', borderRadius: 12, position: 'relative',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent', transition: 'all 0.2s',
  },
  rarityName: { fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.04em' },
  rarityLock: {
    fontSize: '0.4rem', fontWeight: 700, color: 'rgba(255,255,255,0.25)',
    letterSpacing: '0.06em', marginTop: 2,
  },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 },
  typeCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    padding: '14px 8px', borderRadius: 14,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
    fontFamily: 'inherit', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    transition: 'all 0.2s',
  },
  typeCardName: { fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' },
  typeCardDesc: { fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', textAlign: 'center', lineHeight: 1.3 },
  confirmTypeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '12px 16px', borderRadius: 14,
    background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.15)',
    color: '#00f0ff', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  },
  nsfwBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', marginBottom: 10, borderRadius: 10,
    background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.15)',
  },
  scanBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 12px', marginBottom: 10, borderRadius: 10,
    background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.08)',
  },
  mediaPreview: {
    position: 'relative', marginBottom: 12, borderRadius: 14, overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.06)',
  },
  previewThumb: { width: '100%', height: 160, objectFit: 'cover', display: 'block' },
  audioTag: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: 'rgba(0,255,136,0.03)' },
  removeMedia: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8,
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
    border: 'none', color: '#fff', fontSize: '0.8rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation',
  },
  composeWrap: { position: 'relative', marginBottom: 12 },
  textarea: {
    width: '100%', boxSizing: 'border-box', padding: '12px 14px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16, color: '#f0f0f8',
    fontFamily: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    fontSize: '0.9rem', lineHeight: 1.5, resize: 'none', minHeight: 48,
    outline: 'none', transition: 'border-color 0.2s',
  },
  charCount: {
    position: 'absolute', bottom: 8, right: 12,
    fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em',
  },
  actionBar: { display: 'flex', alignItems: 'center', gap: 10 },
  mediaActions: { flex: 1, display: 'flex', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    transition: 'all 0.15s', position: 'relative', flexShrink: 0,
  },
  divider: { width: 1, height: 20, background: 'rgba(255,255,255,0.06)', margin: '0 4px', flexShrink: 0 },
  lockBadge: {
    position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
    fontSize: '0.4rem', fontWeight: 700, letterSpacing: '0.05em', color: '#b44aff', whiteSpace: 'nowrap',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 14, flexShrink: 0, border: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
    transition: 'all 0.2s', boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
  },
};
