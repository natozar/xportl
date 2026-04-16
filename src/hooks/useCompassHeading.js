import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook that tracks device compass heading.
 * Replaces the previous global `_lastHeading` variable with
 * a properly scoped ref that cleans up listeners on unmount.
 *
 * Returns a ref (not state) to avoid re-renders on every
 * compass tick (~60Hz on some devices).
 */
export function useCompassHeading() {
  const headingRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      headingRef.current =
        e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
    };

    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);

    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  const getHeading = useCallback(() => headingRef.current, []);

  return { headingRef, getHeading };
}
