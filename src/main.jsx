import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/global.css';

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
