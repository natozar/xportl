import React, { useState } from 'react';
import { signInWithGoogle, signInWithApple } from '../services/auth';

export default function AuthGate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    try { await signInWithGoogle(); }
    catch (e) { setError(e.message); setLoading(false); }
  };

  const handleApple = async () => {
    setLoading(true);
    setError(null);
    try { await signInWithApple(); }
    catch (e) { setError(e.message); setLoading(false); }
  };

  return (
    <div style={s.container}>
      <div style={s.center}>
        <div style={s.logo}>
          <span style={s.logoText}>X</span>
        </div>
        <h1 style={s.title}>XPORTL</h1>
        <p style={s.tagline}>Capsulas do tempo em AR</p>
        <p style={s.subtitle}>Entre para plantar e descobrir portais digitais no mundo real.</p>

        <div style={s.buttons}>
          <button style={s.btn} onClick={handleGoogle} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 10 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Conectando...' : 'Entrar com Google'}
          </button>

          <button style={{ ...s.btn, ...s.btnApple }} onClick={handleApple} disabled={loading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 10 }}>
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            {loading ? 'Conectando...' : 'Entrar com Apple'}
          </button>
        </div>

        {error && <p style={s.error}>{error}</p>}

        <p style={s.legal}>
          Ao entrar, voce aceita que sua identidade sera vinculada ao conteudo criado (CF Art. 5, IV — vedacao ao anonimato).
        </p>
      </div>
      <div style={s.footer}>
        <span style={s.footerText}>v1.0.0 // XPORTL</span>
      </div>
    </div>
  );
}

const s = {
  container: {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(ellipse at 50% 80%, rgba(180,74,255,0.06) 0%, var(--bg-void) 60%)',
    padding: 32, position: 'relative',
  },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 340 },
  logo: {
    width: 80, height: 80, borderRadius: '50%',
    border: '2px solid var(--neon-cyan)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 25px rgba(0,240,255,0.3), inset 0 0 15px rgba(180,74,255,0.1)',
  },
  logoText: { fontSize: '3rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 20px rgba(0,240,255,0.4)' },
  title: { fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.35em', marginTop: 20, color: 'var(--text-primary)' },
  tagline: { fontSize: '0.7rem', letterSpacing: '0.25em', color: 'var(--neon-cyan)', textTransform: 'uppercase', marginTop: 4 },
  subtitle: { fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 16 },
  buttons: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 28 },
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '14px 20px', borderRadius: 14, fontFamily: 'inherit',
    fontSize: '0.82rem', fontWeight: 600, border: 'none',
    background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)',
    color: 'var(--text-primary)', transition: 'all 0.15s',
  },
  btnApple: { background: 'rgba(255,255,255,0.03)' },
  error: { fontSize: '0.7rem', color: 'var(--danger)', marginTop: 12 },
  legal: {
    fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)', lineHeight: 1.6,
    marginTop: 20, maxWidth: 280,
  },
  footer: { position: 'absolute', bottom: 24 },
  footerText: { color: 'var(--text-muted)', fontSize: '0.6rem', letterSpacing: '0.15em' },
};
