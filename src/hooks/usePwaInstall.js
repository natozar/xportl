import { useState, useEffect, useCallback } from 'react';

/**
 * PWA Install hook — handles Android (beforeinstallprompt) and iOS detection.
 *
 * Returns:
 *  - canInstall: true if we can show our custom prompt
 *  - isIos: true if iOS device (needs manual instruction)
 *  - isStandalone: true if already installed (never show prompt)
 *  - install: function to trigger Android native install
 *  - dismiss: function to hide the prompt (persists for 7 days)
 */

const DISMISS_KEY = 'xportl_install_dismissed';
const DISMISS_DAYS = 7;

function isDismissed() {
  const ts = localStorage.getItem(DISMISS_KEY);
  if (!ts) return false;
  const diff = Date.now() - parseInt(ts, 10);
  return diff < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isRunningStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true // iOS Safari
  );
}

function detectIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone] = useState(() => isRunningStandalone());
  const [isIos] = useState(() => detectIos());
  const [dismissed, setDismissed] = useState(() => isDismissed());

  // Listen for Android's beforeinstallprompt
  useEffect(() => {
    if (isStandalone) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isStandalone]);

  // Android: trigger native install
  const install = useCallback(async () => {
    if (!deferredPrompt) return false;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (outcome === 'accepted') {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      return true;
    }
    return false;
  }, [deferredPrompt]);

  // Dismiss for N days
  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  // Can we show the prompt?
  const canInstall = !isStandalone && !dismissed && (!!deferredPrompt || (isIos && !isRunningStandalone()));

  return {
    canInstall,
    isIos,
    isAndroid: !!deferredPrompt,
    isStandalone,
    install,
    dismiss,
  };
}
