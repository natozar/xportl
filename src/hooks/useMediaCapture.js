import { useState, useRef, useCallback } from 'react';
import { classifyImage } from '../services/nsfwFilter';

/**
 * Hook for capturing photos and recording audio clips.
 * Photos are scanned for NSFW content before being made available.
 */
export function useMediaCapture() {
  const [media, setMedia] = useState(null); // { blob, type: 'image'|'audio', preview }
  const [recording, setRecording] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [moderationError, setModerationError] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  // ── Capture photo + NSFW scan ──
  // facing: 'environment' (default) | 'user'
  // - 'environment': read from AR.js's live video element when available,
  //   fall back to a fresh getUserMedia if AR didn't mount.
  // - 'user': always open a fresh getUserMedia with the front camera.
  //   Front vs back are distinct deviceIds, so this does NOT conflict
  //   with AR.js holding the back camera on iOS/Android.
  const capturePhoto = useCallback(async (facing = 'environment') => {
    setModerationError(null);

    try {
      const canvas = document.createElement('canvas');

      const arVideo =
        facing === 'environment' &&
        (document.querySelector('a-scene video') ||
          document.querySelector('#arjs-video') ||
          document.querySelector('video[autoplay][playsinline]'));

      if (arVideo && arVideo.videoWidth) {
        canvas.width = arVideo.videoWidth;
        canvas.height = arVideo.videoHeight;
        canvas.getContext('2d').drawImage(arVideo, 0, 0);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing === 'user' ? 'user' : 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        try { await video.play(); } catch (_) { /* iOS may need a moment */ }
        await new Promise((r) => setTimeout(r, 350));
        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1440;
        const ctx = canvas.getContext('2d');
        // Mirror front-camera captures so the stored image matches the
        // live preview the user just took.
        if (facing === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        stream.getTracks().forEach((t) => t.stop());
      }

      const preview = canvas.toDataURL('image/webp', 0.92);

      // ── NSFW scan BEFORE making photo available ──
      setScanning(true);
      const result = await classifyImage(preview);
      setScanning(false);

      if (result.blocked) {
        setModerationError(result.reason);
        console.warn('[XPortl] NSFW blocked:', result.scores);
        return null;
      }

      const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.92));
      setMedia({ blob, type: 'image', preview });
      return { blob, type: 'image', preview };
    } catch (err) {
      setScanning(false);
      console.error('[XPortl] Photo capture failed:', err);
      return null;
    }
  }, []);

  // ── Start audio recording ──
  const startAudioRecording = useCallback(async () => {
    setModerationError(null);
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

      setTimeout(() => {
        if (recorderRef.current?.state === 'recording') {
          stopAudioRecording();
        }
      }, 30000);
    } catch (err) {
      console.error('[XPortl] Audio recording failed:', err);
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
    setModerationError(null);
  }, [media]);

  const dismissModerationError = useCallback(() => {
    setModerationError(null);
  }, []);

  return {
    media,
    recording,
    scanning,
    moderationError,
    capturePhoto,
    startAudioRecording,
    stopAudioRecording,
    clearMedia,
    dismissModerationError,
  };
}
