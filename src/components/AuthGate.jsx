import { useState } from 'react';
import {
  signInWithGoogle,
  signUpWithEmail, signInWithEmail, resetPassword,
  sendPhoneOtp, verifyPhoneOtp,
} from '../services/auth';

const MIN_AGE = 13;

function calculateAge(birthDate) {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function AuthGate() {
  const [mode, setMode] = useState('main'); // main | email | phone | verify-email | verify-phone | forgot | age-gate
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [_success, setSuccess] = useState(null);

  // Email state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [birthDate, setBirthDate] = useState('');

  // Phone state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  const clearState = () => { setError(null); setSuccess(null); setLoading(false); };

  // ── Google ──
  const handleGoogle = async () => {
    setLoading(true); setError(null);
    try { await signInWithGoogle(); }
    catch (e) { setError(e.message); setLoading(false); }
  };

  // ── Email ──
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password || loading) return;
    setLoading(true); setError(null);

    try {
      if (isSignUp) {
        // Age gate: require birth date for new accounts
        if (!birthDate) {
          setError('Informe sua data de nascimento');
          setLoading(false);
          return;
        }
        const age = calculateAge(birthDate);
        if (age < MIN_AGE) {
          setError(`Voce precisa ter no minimo ${MIN_AGE} anos para criar uma conta (ECA).`);
          setLoading(false);
          return;
        }
        await signUpWithEmail(email, password);
        setMode('verify-email');
      } else {
        await signInWithEmail(email, password);
        // Supabase auth listener in App.jsx will pick up the session
      }
    } catch (err) {
      setError(
        err.message.includes('Invalid login')
          ? 'E-mail ou senha incorretos'
          : err.message.includes('already registered')
          ? 'Este e-mail ja esta cadastrado. Tente fazer login.'
          : err.message.includes('least 6')
          ? 'A senha deve ter no minimo 6 caracteres'
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Phone: send OTP ──
  const handlePhoneSend = async (e) => {
    e.preventDefault();
    if (!phone || loading) return;
    setLoading(true); setError(null);

    // Format: ensure +55 prefix
    let formatted = phone.replace(/\D/g, '');
    if (formatted.length === 11) formatted = '55' + formatted;
    if (!formatted.startsWith('+')) formatted = '+' + formatted;

    try {
      await sendPhoneOtp(formatted);
      setPhone(formatted);
      setMode('verify-phone');
    } catch (err) {
      setError(err.message.includes('rate') ? 'Aguarde antes de enviar outro SMS' : err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Phone: verify OTP ──
  const handlePhoneVerify = async (e) => {
    e.preventDefault();
    if (!otp || loading) return;
    setLoading(true); setError(null);

    try {
      await verifyPhoneOtp(phone, otp);
    } catch (err) {
      setError(err.message.includes('expired') ? 'Codigo expirado. Solicite novo SMS.' : 'Codigo incorreto');
    } finally {
      setLoading(false);
    }
  };

  // ── Verify email confirmation screen ──
  if (mode === 'verify-email') {
    return (
      <Shell>
        <div style={s.verifyIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="3" stroke="#00f0ff" strokeWidth="1.5" />
            <path d="M2 7l10 6 10-6" stroke="#00f0ff" strokeWidth="1.5" />
          </svg>
        </div>
        <h2 style={s.verifyTitle}>VERIFIQUE SEU E-MAIL</h2>
        <p style={s.verifyText}>
          Enviamos um link de confirmacao para <strong style={{ color: '#00f0ff' }}>{email}</strong>.
          Abra seu e-mail e clique no link para ativar sua conta.
        </p>
        <p style={s.verifyHint}>Nao recebeu? Verifique a pasta de spam.</p>
        <button style={s.backBtn} onClick={() => { clearState(); setMode('email'); }}>
          Voltar
        </button>
      </Shell>
    );
  }

  // ── Verify phone OTP screen ──
  if (mode === 'verify-phone') {
    return (
      <Shell>
        <h2 style={s.formTitle}>VERIFICAR TELEFONE</h2>
        <p style={s.formSub}>
          Enviamos um codigo SMS para <strong style={{ color: '#00f0ff' }}>{phone}</strong>
        </p>
        <form onSubmit={handlePhoneVerify} style={s.form}>
          <input
            style={s.input}
            type="text"
            inputMode="numeric"
            placeholder="Codigo de 6 digitos"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoComplete="one-time-code"
            maxLength={6}
          />
          <button style={s.submitBtn} type="submit" disabled={loading || otp.length < 6}>
            {loading ? 'Verificando...' : 'Confirmar codigo'}
          </button>
        </form>
        {error && <p style={s.error}>{error}</p>}
        <button style={s.backBtn} onClick={() => { clearState(); setMode('phone'); setOtp(''); }}>
          Reenviar SMS
        </button>
      </Shell>
    );
  }

  // ── Forgot password ──
  if (mode === 'forgot') {
    const handleForgot = async (e) => {
      e.preventDefault();
      if (!email || loading) return;
      setLoading(true); setError(null);
      try {
        await resetPassword(email);
        setSuccess(true);
      } catch (err) { setError(err.message); }
      finally { setLoading(false); }
    };

    return (
      <Shell>
        <h2 style={s.formTitle}>REDEFINIR SENHA</h2>
        {_success ? (
          <>
            <p style={s.verifyText}>Enviamos um link de redefinicao para <strong style={{ color: '#00f0ff' }}>{email}</strong>.</p>
            <button style={s.backBtn} onClick={() => { clearState(); setMode('email'); }}>Voltar ao login</button>
          </>
        ) : (
          <>
            <p style={s.formSub}>Informe seu e-mail para receber o link de redefinicao</p>
            <form onSubmit={handleForgot} style={s.form}>
              <input style={s.input} type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              <button style={s.submitBtn} type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link'}
              </button>
            </form>
            {error && <p style={s.error}>{error}</p>}
            <button style={s.backBtn} onClick={() => { clearState(); setMode('email'); }}>Voltar</button>
          </>
        )}
      </Shell>
    );
  }

  // ── Email form ──
  if (mode === 'email') {
    return (
      <Shell>
        <h2 style={s.formTitle}>{isSignUp ? 'CRIAR CONTA' : 'ENTRAR COM E-MAIL'}</h2>
        <form onSubmit={handleEmailSubmit} style={s.form}>
          <input
            style={s.input}
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            style={s.input}
            type="password"
            placeholder={isSignUp ? 'Crie uma senha (min. 6)' : 'Sua senha'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={6}
            required
          />
          {isSignUp && (
            <div>
              <label style={s.birthLabel}>Data de nascimento</label>
              <input
                style={s.input}
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                required
              />
            </div>
          )}
          <button style={s.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
          </button>
        </form>
        {error && <p style={s.error}>{error}</p>}
        {!isSignUp && (
          <button style={s.switchBtn} onClick={() => { setError(null); setMode('forgot'); }}>
            Esqueci minha senha
          </button>
        )}
        <button style={s.switchBtn} onClick={() => { setIsSignUp(!isSignUp); setError(null); }}>
          {isSignUp ? 'Ja tem conta? Entrar' : 'Nao tem conta? Criar agora'}
        </button>
        <button style={s.backBtn} onClick={() => { clearState(); setMode('main'); }}>
          Voltar
        </button>
      </Shell>
    );
  }

  // ── Phone form ──
  if (mode === 'phone') {
    return (
      <Shell>
        <h2 style={s.formTitle}>ENTRAR COM TELEFONE</h2>
        <p style={s.formSub}>Enviaremos um codigo SMS para verificar seu numero</p>
        <form onSubmit={handlePhoneSend} style={s.form}>
          <div style={s.phoneRow}>
            <span style={s.phonePrefix}>+55</span>
            <input
              style={{ ...s.input, flex: 1, marginBottom: 0 }}
              type="tel"
              inputMode="numeric"
              placeholder="(11) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
          </div>
          <button style={s.submitBtn} type="submit" disabled={loading}>
            {loading ? 'Enviando SMS...' : 'Enviar codigo'}
          </button>
        </form>
        {error && <p style={s.error}>{error}</p>}
        <button style={s.backBtn} onClick={() => { clearState(); setMode('main'); }}>
          Voltar
        </button>
      </Shell>
    );
  }

  // ── Main screen (method picker) ──
  return (
    <Shell>
      <p style={s.subtitle}>Entre para plantar e descobrir portais digitais no mundo real.</p>

      <div style={s.buttons}>
        {/* Google */}
        <button style={s.btn} onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 10 }}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'Conectando...' : 'Entrar com Google'}
        </button>

        <div style={s.divider}>
          <div style={s.dividerLine} />
          <span style={s.dividerText}>ou</span>
          <div style={s.dividerLine} />
        </div>

        {/* Email */}
        <button style={s.btn} onClick={() => { clearState(); setMode('email'); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 10 }}>
            <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 7l10 6 10-6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          E-mail e senha
        </button>

        {/* Phone */}
        <button style={s.btn} onClick={() => { clearState(); setMode('phone'); }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginRight: 10 }}>
            <rect x="6" y="2" width="12" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <line x1="10" y1="18" x2="14" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Telefone com SMS
        </button>
      </div>

      {error && <p style={s.error}>{error}</p>}

      <p style={s.legal}>
        Ao entrar, voce aceita que sua identidade sera vinculada ao conteudo criado (CF Art. 5, IV — vedacao ao anonimato).
      </p>
    </Shell>
  );
}

// ── Shell wrapper (logo + footer reused across all screens) ──
function Shell({ children }) {
  return (
    <div style={s.container}>
      <div style={s.center}>
        <div style={s.logo}>
          <span style={s.logoText}>X</span>
        </div>
        <h1 style={s.title}>XPORTL</h1>
        <p style={s.tagline}>Deixe rastros. Encontre portais.</p>
        {children}
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
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', maxWidth: 340, width: '100%' },
  logo: {
    width: 72, height: 72, borderRadius: '50%',
    border: '2px solid var(--neon-cyan)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 25px rgba(0,240,255,0.3), inset 0 0 15px rgba(180,74,255,0.1)',
  },
  logoText: { fontSize: '2.5rem', fontWeight: 700, color: 'var(--neon-cyan)', textShadow: '0 0 20px rgba(0,240,255,0.4)' },
  title: { fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.35em', marginTop: 16, color: 'var(--text-primary)' },
  tagline: { fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--neon-cyan)', textTransform: 'uppercase', marginTop: 4, marginBottom: 16 },
  subtitle: { fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 },
  buttons: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 },
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '13px 20px', borderRadius: 14, fontFamily: 'inherit',
    fontSize: '0.8rem', fontWeight: 600,
    background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)',
    color: 'var(--text-primary)', transition: 'all 0.15s',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0',
  },
  dividerLine: { flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' },
  dividerText: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em' },

  // ── Forms ──
  formTitle: { fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--text-primary)', margin: '0 0 6px' },
  formSub: { fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 16 },
  form: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', marginTop: 8 },
  input: {
    width: '100%', padding: '13px 16px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'inherit',
    outline: 'none', transition: 'border-color 0.2s',
  },
  phoneRow: {
    display: 'flex', alignItems: 'center', gap: 8,
  },
  phonePrefix: {
    padding: '13px 12px', borderRadius: 12,
    background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.1)',
    color: '#00f0ff', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0,
  },
  submitBtn: {
    width: '100%', padding: '14px', borderRadius: 14,
    background: 'rgba(0,240,255,0.12)', color: '#00f0ff',
    fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
    border: '1px solid rgba(0,240,255,0.2)',
    transition: 'all 0.15s', marginTop: 4,
  },
  switchBtn: {
    background: 'none', border: 'none', color: 'var(--neon-cyan)',
    fontSize: '0.68rem', fontFamily: 'inherit', marginTop: 10, opacity: 0.7,
  },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--text-muted)',
    fontSize: '0.65rem', fontFamily: 'inherit', marginTop: 10,
  },

  // ── Verify screens ──
  verifyIcon: { marginBottom: 14, opacity: 0.8 },
  verifyTitle: { fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.15em', color: '#00f0ff', margin: '0 0 10px' },
  verifyText: { fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 8 },
  verifyHint: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', marginBottom: 16 },

  birthLabel: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', marginBottom: 4, display: 'block' },
  error: { fontSize: '0.68rem', color: 'var(--danger)', marginTop: 10 },
  legal: {
    fontSize: '0.52rem', color: 'rgba(255,255,255,0.18)', lineHeight: 1.6,
    marginTop: 18, maxWidth: 280,
  },
  footer: { position: 'absolute', bottom: 24 },
  footerText: { color: 'var(--text-muted)', fontSize: '0.6rem', letterSpacing: '0.15em' },
};
