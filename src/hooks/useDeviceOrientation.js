import { useEffect, useRef, useCallback } from 'react';

/**
 * Tracks device compass heading AND pitch via refs (no re-renders).
 * Pitch: 0 = looking at horizon, positive = up, negative = down.
 */
export function useDeviceOrientation() {
  const headingRef = useRef(null);
  const pitchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      headingRef.current =
        e.webkitCompassHeading ?? (e.alpha !== null ? (360 - e.alpha) % 360 : null);
      // beta: 0 = flat on table, 90 = upright. Convert so 0 = horizon.
      if (e.beta !== null) {
        pitchRef.current = 90 - e.beta;
      }
    };

    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  }, []);

  const getHeading = useCallback(() => headingRef.current, []);
  const getPitch = useCallback(() => pitchRef.current, []);

  return { getHeading, getPitch };
}
