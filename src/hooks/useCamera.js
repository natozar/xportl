import { useState, useCallback } from 'react';

export function useCamera() {
  const [state, setState] = useState({
    granted: false,
    denied: false,
    loading: false,
    error: null,
  });

  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ granted: false, denied: true, loading: false, error: 'Camera API not supported' });
      return;
    }

    setState(s => ({ ...s, loading: true }));

    try {
      // Request camera just to check permission — then immediately release
      // Request the highest resolution the device supports.
      // This also "warms up" the sensor so the first real stream
      // (AR or CameraModal) opens faster.
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      }

      // Permission granted — stop the stream immediately.
      // AR.js will create its own stream when it mounts.
      // Holding the stream causes device lock conflicts on iOS/Android.
      stream.getTracks().forEach((t) => t.stop());

      setState({ granted: true, denied: false, loading: false, error: null });
    } catch (err) {
      setState({ granted: false, denied: true, loading: false, error: err.message });
    }
  }, []);

  // No-op release (stream is already stopped after permission check)
  const release = useCallback(() => {}, []);

  return { ...state, request, release };
}
