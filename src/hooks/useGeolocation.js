import { useState, useEffect, useCallback, useRef } from 'react';

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

  // request() returns a Promise that resolves when the FIRST position arrives
  // or rejects on permission denial. This allows PermissionGate to await it.
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
          setState({
            granted: true,
            denied: false,
            loading: false,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
            error: null,
            watchId,
          });
          // Resolve the promise on first successful position
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
          maximumAge: 5000,
          timeout: 25000,
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
