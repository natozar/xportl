import { useState, useEffect, useCallback } from 'react';

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

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState(s => ({ ...s, denied: true, error: 'Geolocation not supported' }));
      return;
    }

    setState(s => ({ ...s, loading: true }));

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
      },
      (err) => {
        setState(s => ({
          ...s,
          loading: false,
          denied: true,
          error: err.message,
        }));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

    setState(s => ({ ...s, watchId }));
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
