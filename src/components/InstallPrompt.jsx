import React from 'react';

/**
 * PWA Install Prompt — dual-mode (Android native / iOS instructional)
 * Glassmorphism design matching XPortl cyberpunk aesthetic.
 */
export default function InstallPrompt({ isIos, isAndroid, onInstall, onDismiss }) {
  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        {/* Handle */}
        <div style={s.handle} />

        {/* Portal icon */}
        <div style={s.iconWrap}>
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="35" stroke="#00f0ff" strokeWidth="2" opacity="0.4" />
            <circle cx="50" cy="50" r="22" stroke="#b44aff" strokeWidth="1.5" opacity="0.3" />
            <circle cx="50" cy="50" r="8" fill="#00f0ff" opacity="0.6" />
            <text x="50" y="58" textAnchor="middle" fontFamily="monospace" fontSize="20" fontWeight="bold" fill="#00f0ff" opacity="0.9">X</text>
          </svg>
        </div>

        {/* Copy */}
        <h2 style={s.title}>ATIVE SEU PORTAL</h2>
        <p style={s.body}>
          Para desbloquear a lente da realidade paralela e ativar seu radar, adicione o XPortl a tela inicial do celular.
        </p>

        {/* ── Android: native install button ── */}
        {isAndroid && (
          <div style={s.actions}>
            <button style={s.installBtn} onClick={onInstall}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
                <path d="M12 4v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Instalar XPortl
            </button>
            <button style={s.dismissBtn} onClick={onDismiss}>
              Agora nao
            </button>
          </div>
        )}

        {/* ── iOS: instructional guide ── */}
        {isIos && (
          <div style={s.iosGuide}>
            <div style={s.step}>
              <div style={s.stepNum}>1</div>
              <div style={s.stepContent}>
                <p style={s.stepText}>
                  Toque no icone de <strong style={{ color: '#00f0ff' }}>Compartilhar</strong>
                </p>
                {/* iOS Share icon */}
                <div style={s.shareIcon}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="8" width="16" height="14" rx="2" stroke="#00f0ff" strokeWidth="1.5" fill="none" />
                    <path d="M12 2v12" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M8 6l4-4 4 4" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>

            <div style={s.stepDivider} />

            <div style={s.step}>
              <div style={s.stepNum}>2</div>
              <div style={s.stepContent}>
                <p style={s.stepText}>
                  Role e toque em <strong style={{ color: '#00f0ff' }}>Adicionar a Tela de Inicio</strong>
                </p>
                <div style={s.iosBtn}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                    <rect x="3" y="3" width="18" height="18" rx="4" stroke="#00f0ff" strokeWidth="1.5" />
                    <line x1="12" y1="8" x2="12" y2="16" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="8" y1="12" x2="16" y2="12" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  Tela de Inicio
                </div>
              </div>
            </div>

            <div style={s.stepDivider} />

            <div style={s.step}>
              <div style={s.stepNum}>3</div>
              <div style={s.stepContent}>
                <p style={s.stepText}>
                  Confirme tocando em <strong style={{ color: '#00f0ff' }}>Adicionar</strong>
                </p>
              </div>
            </div>

            <button style={s.dismissBtn} onClick={onDismiss}>
              Entendi
            </button>
          </div>
        )}

        {/* Subtle footer */}
        <p style={s.footer}>
          O app funciona offline e ocupa menos de 1MB
        </p>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 300, padding: 0,
    pointerEvents: 'auto',
  },
  modal: {
    width: '100%', maxWidth: 440,
    background: 'rgba(13, 10, 26, 0.92)',
    backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
    borderTop: '1px solid rgba(0, 240, 255, 0.1)',
    borderRadius: '24px 24px 0 0',
    padding: '14px 28px 36px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    boxShadow: '0 -20px 60px rgba(0, 0, 0, 0.4), 0 0 40px rgba(0, 240, 255, 0.03)',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    background: 'rgba(255,255,255,0.12)',
    marginBottom: 20,
  },
  iconWrap: {
    marginBottom: 16,
    filter: 'drop-shadow(0 0 20px rgba(0, 240, 255, 0.3))',
    animation: 'float 3s ease-in-out infinite',
  },
  title: {
    fontSize: '0.85rem', fontWeight: 700,
    letterSpacing: '0.25em', color: '#00f0ff',
    textShadow: '0 0 20px rgba(0, 240, 255, 0.3)',
    margin: '0 0 10px', textAlign: 'center',
  },
  body: {
    fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.7, textAlign: 'center',
    maxWidth: 300, marginBottom: 22,
  },

  // ── Android actions ──
  actions: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 8,
  },
  installBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '15px 24px', borderRadius: 16, border: 'none',
    background: 'rgba(0, 240, 255, 0.12)',
    border: '1px solid rgba(0, 240, 255, 0.25)',
    color: '#00f0ff', fontSize: '0.85rem', fontWeight: 700,
    fontFamily: 'inherit', letterSpacing: '0.05em',
    boxShadow: '0 0 25px rgba(0, 240, 255, 0.1)',
    transition: 'all 0.15s',
  },
  dismissBtn: {
    width: '100%', padding: '12px',
    background: 'transparent', border: 'none',
    color: 'rgba(255,255,255,0.25)',
    fontSize: '0.72rem', fontFamily: 'inherit',
    marginTop: 4,
  },

  // ── iOS instructional ──
  iosGuide: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 0,
  },
  step: {
    display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0',
  },
  stepNum: {
    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
    background: 'rgba(0, 240, 255, 0.08)',
    border: '1px solid rgba(0, 240, 255, 0.15)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.7rem', fontWeight: 700, color: '#00f0ff',
  },
  stepContent: {
    flex: 1,
  },
  stepText: {
    fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, margin: 0,
  },
  stepDivider: {
    width: 1, height: 12, marginLeft: 14,
    background: 'rgba(0, 240, 255, 0.08)',
  },
  shareIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 44, height: 44, borderRadius: 12, marginTop: 8,
    background: 'rgba(0, 240, 255, 0.06)',
    border: '1px solid rgba(0, 240, 255, 0.1)',
  },
  iosBtn: {
    display: 'inline-flex', alignItems: 'center',
    padding: '6px 12px', borderRadius: 8, marginTop: 8,
    background: 'rgba(0, 240, 255, 0.06)',
    border: '1px solid rgba(0, 240, 255, 0.1)',
    color: '#00f0ff', fontSize: '0.65rem', fontWeight: 600,
  },

  footer: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.15)',
    marginTop: 16, textAlign: 'center',
  },
};
