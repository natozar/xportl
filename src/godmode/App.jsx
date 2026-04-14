import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import Overview from './pages/Overview';
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
  const [adminRole, setAdminRole] = useState(undefined); // undefined=loading, null=not admin, string=role
  const [error, setError] = useState(null);
  const route = useHashRoute();

  // Resolve session + admin role on boot
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(s);
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
    })();
    return () => { alive = false; };
  }, []);

  // Idle-timeout forced relogin
  useEffect(() => {
    if (!adminRole) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events = ['mousemove', 'keydown', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > IDLE_LIMIT_MS) {
        console.warn('[godmode] idle timeout, forcing relogin');
        supabase.auth.signOut().finally(() => window.location.replace('/app'));
      }
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(interval);
    };
  }, [adminRole]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.replace('/app');
  }, []);

  if (session === undefined || adminRole === undefined) {
    return <div style={s.center}>verificando credenciais…</div>;
  }

  if (!session) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <h1 style={s.h1}>godmode</h1>
          <p style={s.muted}>Você precisa estar logado como admin.</p>
          <a href="/app" style={s.btn}>Ir para login →</a>
        </div>
      </div>
    );
  }

  if (!adminRole) {
    return (
      <div style={s.center}>
        <div style={s.card}>
          <h1 style={s.h1}>403 — acesso negado</h1>
          <p style={s.muted}>
            Sua conta ({session.user.email}) não tem role de admin.
            {error && <><br />Erro: {error}</>}
          </p>
          <button style={s.btnDanger} onClick={handleLogout}>sair</button>
        </div>
      </div>
    );
  }

  const pages = {
    overview: Overview,
    flags: Flags,
    killswitch: KillSwitch,
    audit: Audit,
  };
  const Page = pages[route] || Overview;

  return (
    <div style={s.layout}>
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={s.brandDot} /> godmode
        </div>
        <div style={s.sessionInfo}>
          <div style={s.sessionLabel}>logado como</div>
          <div style={s.sessionEmail}>{session.user.email}</div>
          <div style={s.sessionRole}>{adminRole}</div>
        </div>
        <nav style={s.nav}>
          <NavLink to="overview" active={route === 'overview'}>overview</NavLink>
          <NavLink to="flags" active={route === 'flags'}>feature flags</NavLink>
          <NavLink to="killswitch" active={route === 'killswitch'} danger>kill switch</NavLink>
          <NavLink to="audit" active={route === 'audit'}>audit log</NavLink>
        </nav>
        <button style={s.logoutBtn} onClick={handleLogout}>logout</button>
      </aside>
      <main style={s.main}>
        <Page session={session} adminRole={adminRole} />
      </main>
    </div>
  );
}

function NavLink({ to, active, children, danger }) {
  return (
    <a
      href={`#${to}`}
      style={{
        ...s.navLink,
        ...(active ? s.navLinkActive : {}),
        ...(danger ? { color: '#ff4466' } : {}),
      }}
    >
      {children}
    </a>
  );
}

const s = {
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { maxWidth: 420, padding: 32, background: '#0c0c1c', border: '1px solid #1a1a30', borderRadius: 12 },
  h1: { margin: 0, fontSize: '1.1rem', letterSpacing: '0.2em', textTransform: 'uppercase' },
  muted: { color: '#8888a0', fontSize: '0.85rem', lineHeight: 1.6, marginTop: 12 },
  btn: { display: 'inline-block', marginTop: 16, padding: '10px 18px', background: '#1a1a30', color: '#e8e8f0', textDecoration: 'none', borderRadius: 6, border: '1px solid #2a2a40' },
  btnDanger: { marginTop: 16, padding: '10px 18px', background: '#2a0a10', color: '#ff4466', border: '1px solid #ff4466', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' },
  layout: { display: 'flex', minHeight: '100vh' },
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
  logoutBtn: { padding: '10px 12px', background: 'transparent', color: '#55556a', border: '1px solid #1a1a30', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', fontFamily: 'inherit', textAlign: 'left' },
  main: { flex: 1, padding: 32, overflow: 'auto' },
};
