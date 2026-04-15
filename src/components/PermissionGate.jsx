import React, { useState, useEffect, useRef } from 'react';

export default function PermissionGate({ geo, cam, onComplete }) {
  const [step, setStep] = useState('welcome');
  const [statusText, setStatusText] = useState('');
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // As soon as both permissions are granted, call onComplete ONCE
  // Using ref to avoid re-triggering when onComplete reference changes
  useEffect(() => {
    if (geo.granted && cam.granted && !completedRef.current) {
      completedRef.current = true;
      console.log('[XPortl] Permissions granted — opening portal');
      // Tiny delay for visual feedback, then transition
      const t = setTimeout(() => onCompleteRef.current(), 300);
      return () => clearTimeout(t);
    }
  }, [geo.granted, cam.granted]);

  const handleEnter = async () => {
    setStep('requesting');

    try {
      // Request GPS and camera IN PARALLEL, but AWAIT both
      setStatusText('Ativando GPS...');
      const geoPromise = geo.request();

      setStatusText('Abrindo camera...');
      const camPromise = cam.request();

      // Wait for BOTH to complete (GPS returns a Promise now)
      await Promise.all([
        geoPromise.catch(() => {}), // GPS denial handled by state
        camPromise,
      ]);

      setStatusText('Pronto!');
    } catch (err) {
      console.warn('[XPortl] Permission request error:', err);
      // State updates in the hooks will trigger denied render
    }
  };

  // Both granted → show transition
  if (geo.granted && cam.granted) {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <div style={{ ...styles.logo, animation: 'float 2s ease-in-out infinite' }}>
            <span className="neon-green" style={{ fontSize: '2.5rem', fontWeight: 700 }}>X</span>
          </div>
          <p className="neon-green" style={{ fontSize: '0.75rem', letterSpacing: '0.3em', marginTop: 16 }}>
            ABRINDO PORTAL...
          </p>
        </div>
      </div>
    );
  }

  // Denied
  const denied = geo.denied || cam.denied;
  if (denied) {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <div style={styles.iconDenied}>!</div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 8, color: 'var(--danger)' }}>
            Acesso Negado
          </h2>
          <p style={styles.subtitle}>
            O XPortl precisa da sua <strong>camera</strong> e <strong>localizacao</strong> para
            revelar os portais escondidos ao seu redor.
          </p>
          {geo.denied && (
            <p style={styles.errorDetail}>GPS: {geo.error || 'Permissao negada'}</p>
          )}
          {cam.denied && (
            <p style={styles.errorDetail}>Camera: {cam.error || 'Permissao negada'}</p>
          )}
          <p style={{ ...styles.subtitle, marginTop: 20, fontSize: '0.7rem' }}>
            Abra as configuracoes do navegador e permita o acesso, depois recarregue a pagina.
          </p>
          <button
            className="btn-ghost"
            style={{ marginTop: 16 }}
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // Requesting (waiting for permissions)
  if (step === 'requesting') {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p style={{ ...styles.subtitle, marginTop: 20 }}>
            {statusText || 'Calibrando sensores...'}
          </p>
          <div style={styles.permStatus}>
            <PermItem label="GPS" ok={geo.granted} loading={geo.loading} />
            <PermItem label="Camera" ok={cam.granted} loading={cam.loading} />
          </div>
        </div>
      </div>
    );
  }

  // Welcome screen (first click)
  return (
    <div style={styles.container}>
      <div style={styles.center}>
        <div style={styles.logo}>
          <span className="neon-green" style={{ fontSize: '3rem', fontWeight: 700 }}>X</span>
        </div>
        <h1 style={styles.title}>XPORTL</h1>
        <p style={styles.tagline}>Deixe rastros. Encontre portais.</p>
        <p style={styles.subtitle}>
          Abra portais digitais escondidos<br />no mundo ao seu redor.
        </p>
        <button className="btn-primary" style={{ marginTop: 32, touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }} onClick={handleEnter}>
          Abrir Portal
        </button>
        <p style={styles.permNote}>
          Sera necessario acesso a camera e GPS
        </p>
      </div>
      <div style={styles.footer}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem', letterSpacing: '0.15em' }}>
          v1.0.0 // XPORTL
        </span>
      </div>
    </div>
  );
}

function PermItem({ label, ok, loading }) {
  return (
    <div style={styles.permItem}>
      {ok ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#00f0ff" strokeWidth="1.5" />
          <path d="M8 12l3 3 5-6" stroke="#00f0ff" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ) : loading ? (
        <div style={styles.permSpinner} />
      ) : (
        <div style={styles.permDot} />
      )}
      <span style={{ ...styles.permLabel, color: ok ? '#00f0ff' : 'var(--text-muted)' }}>
        {label}
      </span>
    </div>
  );
}

const styles = {
  container: {
    width: '100%', height: '100%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(ellipse at 50% 80%, rgba(180,74,255,0.06) 0%, var(--bg-void) 60%)',
    padding: 32, position: 'relative',
  },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
  },
  logo: {
    width: 80, height: 80, borderRadius: '50%',
    border: '2px solid var(--neon-cyan)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 25px rgba(0,240,255,0.3), inset 0 0 15px rgba(180,74,255,0.1)',
  },
  title: {
    fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.35em', marginTop: 20, color: 'var(--text-primary)',
  },
  tagline: {
    fontSize: '0.7rem', letterSpacing: '0.25em', color: 'var(--neon-cyan)',
    textTransform: 'uppercase', marginTop: 4, textShadow: 'var(--glow-cyan)',
  },
  subtitle: {
    fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 16, maxWidth: 280,
  },
  permNote: {
    fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 12, opacity: 0.6,
  },
  footer: { position: 'absolute', bottom: 24 },
  iconDenied: {
    width: 60, height: 60, borderRadius: '50%', border: '2px solid var(--danger)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '1.5rem', color: 'var(--danger)', marginBottom: 16,
  },
  errorDetail: {
    fontSize: '0.7rem', color: 'var(--danger)', opacity: 0.7, marginTop: 4,
  },
  spinner: {
    width: 40, height: 40,
    border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  // Permission status indicators
  permStatus: {
    display: 'flex', gap: 16, marginTop: 16,
  },
  permItem: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  permLabel: {
    fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em',
  },
  permSpinner: {
    width: 14, height: 14,
    border: '2px solid rgba(0,240,255,0.15)', borderTopColor: '#00f0ff',
    borderRadius: '50%', animation: 'spin 0.6s linear infinite',
  },
  permDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
  },
};

if (typeof document !== 'undefined' && !document.getElementById('xportl-spin-kf')) {
  const style = document.createElement('style');
  style.id = 'xportl-spin-kf';
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
