import { useEffect, useRef } from 'react';

/**
 * Keep the screen awake while `active` is true. Re-requests on visibility
 * change because Chrome/Safari drop the lock when the tab backgrounds.
 *
 *   useWakeLock(arActive)
 *
 * No-op on browsers without the Wake Lock API (older iOS, etc).
 */
export function useWakeLock(active) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === 'undefined' || !navigator.wakeLock?.request) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        lock.addEventListener?.('release', () => {
          // Browser-initiated release (tab hidden, etc). Refetch on visibility.
          lockRef.current = null;
        });
      } catch (err) {
        // NotAllowedError when document not focused — silently retry on visibility.
        console.debug('[XPortl] WakeLock acquire failed:', err?.name || err);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !lockRef.current && active) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock?.release) lock.release().catch(() => {});
    };
  }, [active]);
}
