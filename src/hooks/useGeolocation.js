import { useState, useEffect, useCallback, useRef } from 'react';

// Reject positions with accuracy worse than this (meters).
// In dense urban / indoor, accuracy can be 100-500m — unusable for AR.
const MAX_ACCURACY = 100;

// Smooth GPS jitter with exponential moving average
function smoothCoord(prev, next, alpha = 0.3) {
  if (prev === null) return next;
  return prev + alpha * (next - prev);
}

export function useGeolocation() {
  const [state, setState] = useState({
    granted: false,
    denied: false,
    loading: false,
    lat: null,
    lng: null,
    altitude: null,
    accuracy: null,
    error: null,
    watchId: null,
  });

  const resolveRef = useRef(null);
  const lastGoodRef = useRef({ lat: null, lng: null });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState(s => ({ ...s, denied: true, error: 'Geolocation not supported' }));
      return Promise.reject(new Error('Geolocation not supported'));
    }

    setState(s => ({ ...s, loading: true }));

    return new Promise((resolve, reject) => {
      resolveRef.current = resolve;

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, altitude, accuracy } = pos.coords;

          // Reject wildly inaccurate positions (urban canyon / indoor)
          if (accuracy > MAX_ACCURACY) {
            console.warn(`[XPortl GPS] Rejected position: accuracy ${accuracy.toFixed(0)}m > ${MAX_ACCURACY}m`);
            // Still resolve first promise so app doesn't hang
            if (resolveRef.current) {
              resolveRef.current(pos);
              resolveRef.current = null;
            }
            return;
          }

          // Smooth coordinates to reduce jitter
          const smoothLat = smoothCoord(lastGoodRef.current.lat, latitude);
          const smoothLng = smoothCoord(lastGoodRef.current.lng, longitude);
          lastGoodRef.current = { lat: smoothLat, lng: smoothLng };

          setState({
            granted: true,
            denied: false,
            loading: false,
            lat: smoothLat,
            lng: smoothLng,
            altitude,
            accuracy,
            error: null,
            watchId,
          });

          if (resolveRef.current) {
            resolveRef.current(pos);
            resolveRef.current = null;
          }
        },
        (err) => {
          setState(s => ({
            ...s,
            loading: false,
            denied: true,
            error: err.message,
          }));
          if (resolveRef.current) {
            reject(err);
            resolveRef.current = null;
          }
        },
        {
          enableHighAccuracy: true,
          maximumAge: 2000,   // Tighter: 2s max stale position
          timeout: 15000,     // Faster timeout
        }
      );

      setState(s => ({ ...s, watchId }));
    });
  }, []);

  useEffect(() => {
    return () => {
      if (state.watchId !== null) {
        navigator.geolocation.clearWatch(state.watchId);
      }
    };
  }, [state.watchId]);

  return { ...state, request };
}
