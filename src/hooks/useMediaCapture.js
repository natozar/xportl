import { useState, useRef, useCallback } from 'react';

/**
 * Hook for capturing photos and recording audio clips.
 * Returns captured media as a Blob ready for upload.
 */
export function useMediaCapture() {
  const [media, setMedia] = useState(null); // { blob, type: 'image'|'audio', preview }
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // ── Capture photo from camera ──
  const capturePhoto = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      await video.play();

      // Wait a frame for the camera to stabilize
      await new Promise((r) => setTimeout(r, 300));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      stream.getTracks().forEach((t) => t.stop());

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
      const preview = canvas.toDataURL('image/webp', 0.5);

      setMedia({ blob, type: 'image', preview });
      return { blob, type: 'image', preview };
    } catch (err) {
      console.error('[Xplore] Photo capture failed:', err);
      return null;
    }
  }, []);

  // ── Start audio recording ──
  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const preview = URL.createObjectURL(blob);
        setMedia({ blob, type: 'audio', preview });
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (recorderRef.current?.state === 'recording') {
          stopAudioRecording();
        }
      }, 30000);
    } catch (err) {
      console.error('[Xplore] Audio recording failed:', err);
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
      setRecording(false);
    }
  }, []);

  const clearMedia = useCallback(() => {
    if (media?.preview && media.type === 'audio') {
      URL.revokeObjectURL(media.preview);
    }
    setMedia(null);
  }, [media]);

  return {
    media,
    recording,
    capturePhoto,
    startAudioRecording,
    stopAudioRecording,
    clearMedia,
  };
}
