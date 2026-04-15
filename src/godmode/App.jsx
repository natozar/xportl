import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import Overview from './pages/Overview';
import Errors from './pages/Errors';
import Flags from './pages/Flags';
import KillSwitch from './pages/KillSwitch';
import Audit from './pages/Audit';

const IDLE_LIMIT_MS = 15 * 60 * 1000;

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || 'overview');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash.slice(1) || 'overview');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [adminRole, setAdminRole] = useState(undefined);
  const [error, setError] = useState(null);
  const route = useHashRoute();

  // Resolve session + admin role
  useEffect(() => {
    let alive = true;

    const checkAdmin = async (s) => {
      if (!s) { setAdminRole(null); return; }

      const { data, error: err } = await supabase
        .from('admin_users')
        .select('role, is_active')
        .eq('user_id', s.user.id)
        .maybeSingle();

      if (!alive) return;
      if (err) { setError(err.message); setAdminRole(null); return; }
      if (!data || !data.is_active) { setAdminRole(null); return; }
      setAdminRole(data.role);
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!alive) return;
      setSession(s);
      checkAdmin(s);
    });

    // Listen for auth changes (if user logs in/out in another tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!alive) return;
      setSession(s);
      if (s) checkAdmin(s);
      else setAdminRole(null);
    });

    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  // Idle timeout — only locks the godmode view, does NOT sign out of Supabase
  const [idleLocked, setIdleLocked] = useState(false);
  useEffect(() => {
    if (!adminRole) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_LIMIT_MS) {
        setIdleLocked(true);
      }
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
    };
  }, [adminRole]);

  // Godmode logout: only leaves this panel, does NOT destroy Supabase session
  const handleLeaveGodmode = useCallback(() => {
    window.location.replace('/app');
  }, []);

  // Loading
  if (session === undefined || adminRole === undefined) {
    return <div style={s.center}><span style={s.muted}>verificando credenciais…</span></div>;
  }

  // Not logged in at all
  if (!session) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <h1 style={s.h1}>godmode</h1>
          <p style={s.muted}>Voce precisa estar logado no app primeiro.</p>
          <a href="/app" style={s.btn}>Ir para o app e fazer login</a>
          <p style={s.hint}>Depois de logar, volte para /godmode</p>
        </div>
      </div>
    );
  }

  // Logged in but not admin
  if (!adminRole) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <h1 style={s.h1}>403 — acesso negado</h1>
          <p style={s.muted}>
            Sua conta <strong>{session.user.email}</strong> nao tem permissao de admin.
            {error && <><br /><span style={{ color: '#ff4466' }}>Erro: {error}</span></>}
          </p>
          <button style={s.btn} onClick={handleLeaveGodmode}>Voltar ao app</button>
        </div>
      </div>
    );
  }

  // Idle locked
  if (idleLocked) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <h1 style={s.h1}>sessao expirada</h1>
          <p style={s.muted}>Inatividade por mais de 15 minutos.</p>
          <button style={s.btn} onClick={() => setIdleLocked(false)}>Continuar</button>
          <button style={{ ...s.btn, marginLeft: 8 }} onClick={handleLeaveGodmode}>Sair</button>
        </div>
      </div>
    );
  }

  const pages = { overview: Overview, errors: Errors, flags: Flags, killswitch: KillSwitch, audit: Audit };
  const Page = pages[route] || Overview;

  return (
    <div style={s.layout}>
      <aside style={s.sidebar}>
        <div style={s.brand}><span style={s.brandDot} /> godmode</div>
        <div style={s.sessionInfo}>
          <div style={s.sessionLabel}>logado como</div>
          <div style={s.sessionEmail}>{session.user.email}</div>
          <div style={s.sessionRole}>{adminRole}</div>
        </div>
        <nav style={s.nav}>
          <NavLink to="overview" active={route === 'overview'}>overview</NavLink>
          <NavLink to="errors" active={route === 'errors'}>errors</NavLink>
          <NavLink to="flags" active={route === 'flags'}>feature flags</NavLink>
          <NavLink to="killswitch" active={route === 'killswitch'} danger>kill switch</NavLink>
          <NavLink to="audit" active={route === 'audit'}>audit log</NavLink>
        </nav>
        <div style={s.sidebarFooter}>
          <a href="/app" style={s.backLink}>← voltar ao app</a>
          <button style={s.logoutBtn} onClick={handleLeaveGodmode}>sair do godmode</button>
        </div>
      </aside>
      <main style={s.main}>
        <Page session={session} adminRole={adminRole} />
      </main>
    </div>
  );
}

function NavLink({ to, active, children, danger }) {
  return (
    <a href={`#${to}`} style={{ ...s.navLink, ...(active ? s.navLinkActive : {}), ...(danger ? { color: '#ff4466' } : {}) }}>
      {children}
    </a>
  );
}

const s = {
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, background: '#06061a', color: '#c8c8e0' },
  card: { maxWidth: 420, padding: 32, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 12 },
  h1: { margin: 0, fontSize: '1.1rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8c8e0' },
  muted: { color: '#8888a0', fontSize: '0.85rem', lineHeight: 1.6, marginTop: 12 },
  hint: { color: '#55556a', fontSize: '0.65rem', marginTop: 8 },
  btn: { display: 'inline-block', marginTop: 16, padding: '10px 18px', background: '#1a1a30', color: '#e8e8f0', textDecoration: 'none', borderRadius: 6, border: '1px solid #2a2a40', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem' },
  layout: { display: 'flex', minHeight: '100vh', background: '#06061a', color: '#c8c8e0' },
  sidebar: { width: 240, background: '#08081a', borderRight: '1px solid #1a1a30', padding: '24px 16px', display: 'flex', flexDirection: 'column' },
  brand: { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c8c8e0', marginBottom: 24 },
  brandDot: { width: 8, height: 8, borderRadius: '50%', background: '#ff4466', boxShadow: '0 0 10px #ff4466' },
  sessionInfo: { padding: '12px 0', borderTop: '1px solid #1a1a30', borderBottom: '1px solid #1a1a30', marginBottom: 20 },
  sessionLabel: { fontSize: '0.55rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#55556a', marginBottom: 4 },
  sessionEmail: { fontSize: '0.72rem', color: '#c8c8e0', wordBreak: 'break-all' },
  sessionRole: { fontSize: '0.6rem', color: '#00e5ff', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.15em' },
  nav: { display: 'flex', flexDirection: 'column', gap: 4, flex: 1 },
  navLink: { padding: '10px 12px', color: '#8888a0', textDecoration: 'none', fontSize: '0.75rem', borderRadius: 4, transition: 'all 0.15s' },
  navLinkActive: { background: '#12122a', color: '#e8e8f0' },
  sidebarFooter: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid #1a1a30' },
  backLink: { padding: '8px 12px', color: '#00e5ff', textDecoration: 'none', fontSize: '0.7rem', borderRadius: 4 },
  logoutBtn: { padding: '10px 12px', background: 'transparent', color: '#55556a', border: '1px solid #1a1a30', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit', textAlign: 'left' },
  main: { flex: 1, padding: 32, overflow: 'auto' },
};
