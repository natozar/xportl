import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/global.css';

// Kill-switch: legacy SWs (from earlier dev builds with devOptions.enabled) shipped
// a `registerSW.js` helper and cached stale bundle hashes. Unregister them before
// the new SW takes over so users don't get stranded on 404ing asset URLs.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || '';
      if (url.includes('registerSW.js')) {
        reg.unregister();
      }
    }
  }).catch(() => {});
}

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
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
