import { useState, useEffect, useCallback, useRef } from 'react';

// Accuracy threshold below which a fix is considered "trustworthy" for AR.
// Above this we still USE the fix (NOT having coords is much worse than
// having imprecise ones — capsule discovery breaks entirely), but flag it
// as low-accuracy so UIs can warn the user. Indoor GPS routinely sits at
// 50-200m, so rejecting >100m fixes meant never resolving at home.
const HIGH_ACCURACY_THRESHOLD = 100;

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
    lowAccuracy: false,
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

          // Smooth coordinates to reduce jitter (high-accuracy fixes get more
          // smoothing weight; low-accuracy fixes are accepted but logged).
          const isLowAcc = accuracy > HIGH_ACCURACY_THRESHOLD;
          if (isLowAcc) {
            console.warn(`[XPortl GPS] Low-accuracy fix accepted: ±${accuracy.toFixed(0)}m`);
          }
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
            lowAccuracy: isLowAcc,
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
