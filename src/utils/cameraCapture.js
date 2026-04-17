/**
 * Find the AR.js video element in the DOM.
 */
export function findArVideo() {
  return (
    document.querySelector('a-scene video') ||
    document.querySelector('#arjs-video') ||
    document.querySelector('video[autoplay][playsinline]')
  );
}

/**
 * Capture a frame from a video element and compress to WebP.
 * Returns { previewUrl, blob } or null if capture fails.
 */
export async function captureFrameAsWebp(videoEl, maxDim = 1280, quality = 0.82) {
  if (!videoEl || !videoEl.videoWidth) return null;

  const sw = videoEl.videoWidth;
  const sh = videoEl.videoHeight;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoEl, 0, 0, dw, dh);

  const previewUrl = canvas.toDataURL('image/webp', quality);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null);
        resolve({ previewUrl, blob });
      },
      'image/webp',
      quality
    );
  });
}
