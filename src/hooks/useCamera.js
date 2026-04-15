import { useState, useCallback, useEffect } from 'react';

export function useCamera() {
  const [state, setState] = useState({
    granted: false,
    denied: false,
    loading: false,
    stream: null,
    error: null,
  });

  const request = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState(s => ({ ...s, denied: true, error: 'Camera API not supported' }));
      return;
    }

    setState(s => ({ ...s, loading: true }));

    try {
      // Try HD rear camera first, fallback to basic constraints on older devices
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });
      } catch (_) {
        // Fallback: simpler constraints for older Android/iOS
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      }

      setState({
        granted: true,
        denied: false,
        loading: false,
        stream,
        error: null,
      });
    } catch (err) {
      setState({
        granted: false,
        denied: true,
        loading: false,
        stream: null,
        error: err.message,
      });
    }
  }, []);

  // Auto-release the permission-check stream after 3s so it doesn't
  // conflict with AR.js acquiring the camera. The delay gives AR.js
  // time to mount and request its own getUserMedia.
  useEffect(() => {
    if (state.granted && state.stream) {
      const t = setTimeout(() => {
        setState((s) => {
          if (s.stream) {
            s.stream.getTracks().forEach((track) => track.stop());
          }
          return { ...s, stream: null };
        });
      }, 3000);
      return () => clearTimeout(t);
    }
  }, [state.granted, state.stream]);

  const release = useCallback(() => {
    setState((s) => {
      if (s.stream) {
        s.stream.getTracks().forEach((t) => t.stop());
      }
      return { ...s, stream: null };
    });
  }, []);

  return { ...state, request, release };
}
