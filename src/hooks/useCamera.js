import { useState, useCallback } from 'react';

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

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

  // Release the stream so AR.js can take over the camera
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
