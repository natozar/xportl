import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/global.css';

// In-app mobile console — activate with ?debug=1 in the URL.
// Dynamic import so Eruda (~400KB) is code-split and never loads in prod
// unless explicitly requested. Also persisted via sessionStorage so it
// survives page reloads within the same debug session.
(function () {
  try {
    const qs = new window.URLSearchParams(window.location.search);
    if (qs.get('debug') === '1') sessionStorage.setItem('xportl_debug', '1');
    if (qs.get('debug') === '0') sessionStorage.removeItem('xportl_debug');
    if (sessionStorage.getItem('xportl_debug') === '1') {
      import('eruda').then((mod) => {
        const eruda = mod.default || mod;
        eruda.init({ tool: ['console', 'network', 'elements', 'resources', 'info'] });
        // Pre-filter to our own log namespaces for quick signal
        try { eruda.get('console').filter('XPortl'); } catch { /* optional */ }
        console.log('[XPortl Debug] Eruda active. Filter: "XPortl". Use ?debug=0 to disable.');
      }).catch((e) => console.warn('[XPortl Debug] Eruda load failed:', e));
    }
  } catch { /* noop — SSR or blocked storage */ }
})();

// Kill-switch: legacy SWs
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || '';
      if (url.includes('registerSW.js')) reg.unregister();
    }
  }).catch(() => {});
}

// PWA update notification — show toast when new version available
registerSW({
  immediate: true,
  onNeedRefresh() {
    // Create update toast
    const toast = document.createElement('div');
    toast.id = 'xportl-update-toast';
    toast.innerHTML = `
      <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:99999;
        display:flex;align-items:center;gap:10px;padding:12px 20px;
        background:rgba(10,8,20,0.95);backdrop-filter:blur(20px);
        border:1px solid rgba(0,240,255,0.2);border-radius:50px;
        color:#00f0ff;font-size:0.72rem;font-weight:600;font-family:inherit;
        box-shadow:0 4px 24px rgba(0,0,0,0.5);">
        <span>Nova versao disponivel</span>
        <button onclick="document.getElementById('xportl-update-toast').remove();location.reload();"
          style="padding:6px 14px;border-radius:8px;background:rgba(0,240,255,0.15);
          border:1px solid rgba(0,240,255,0.3);color:#00f0ff;font-size:0.65rem;
          font-weight:700;font-family:inherit;cursor:pointer;">
          Atualizar
        </button>
      </div>`;
    document.body.appendChild(toast);
  },
});

// Global error tracking. Uses dynamic import() (ESM-safe) instead of require,
// which was silently throwing ReferenceError and killing the entire pipeline.
const reportError = (payload) => {
  import('./services/supabase')
    .then(({ supabase }) => supabase.from('error_events').insert(payload))
    .catch(() => { /* supabase unavailable — swallow */ });
};

window.addEventListener('error', (event) => {
  console.error('[XPortl] Global error:', event.message);
  reportError({
    source: 'client',
    error_name: 'JS_ERROR',
    error_message: event.message,
    error_stack: event.error?.stack || null,
    url: event.filename,
    user_agent: navigator.userAgent,
    severity: 'error',
    metadata: { lineno: event.lineno, colno: event.colno },
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[XPortl] Unhandled rejection:', event.reason);
  reportError({
    source: 'client',
    error_name: 'UNHANDLED_REJECTION',
    error_message: String(event.reason),
    error_stack: event.reason?.stack || null,
    url: window.location.href,
    user_agent: navigator.userAgent,
    severity: 'error',
  });
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// Fade out the static App Shell once React has painted the first frame.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const shell = document.getElementById('app-shell');
    if (!shell) return;
    shell.classList.add('hidden');
    shell.addEventListener('transitionend', () => shell.remove(), { once: true });
    setTimeout(() => shell.remove(), 800);
  });
});

// Real-user web-vitals. Dynamic import keeps it out of the critical path;
// metrics stream to Supabase fire-and-forget so lab vs field can be compared.
import('./services/webVitals').then(({ reportWebVitals }) => reportWebVitals());
