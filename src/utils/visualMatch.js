/**
 * Lightweight perceptual image matching for PWA.
 *
 * Strategy: downscale both images to 16x16 grayscale, compute
 * average hash (aHash), compare via hamming distance.
 * Fast enough for ~10fps on any phone.
 *
 * Returns 0-1 similarity (1 = identical scene).
 */

const HASH_SIZE = 16; // 16x16 = 256 bits
const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (canvas) { canvas.width = HASH_SIZE; canvas.height = HASH_SIZE; }

/**
 * Compute perceptual hash from an image source (HTMLImageElement, HTMLVideoElement, or ImageBitmap).
 * Returns Uint8Array of 0/1 bits (length = HASH_SIZE²).
 */
function computeHash(source) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, HASH_SIZE, HASH_SIZE);
  const pixels = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data;

  // Convert to grayscale values
  const gray = new Float32Array(HASH_SIZE * HASH_SIZE);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    const idx = i * 4;
    gray[i] = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
    sum += gray[i];
  }

  // Average hash: each bit = pixel > average
  const avg = sum / gray.length;
  const hash = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    hash[i] = gray[i] > avg ? 1 : 0;
  }
  return hash;
}

/**
 * Hamming distance between two hashes (0-1, lower = more similar).
 */
function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff++;
  }
  return diff / a.length;
}

/**
 * Compare a video frame against a reference image URL.
 * Returns similarity 0-1 (1 = match).
 */
export async function compareFrameToRef(videoEl, refImageUrl) {
  if (!videoEl || !videoEl.videoWidth || !refImageUrl) return 0;

  // Hash the live frame
  const liveHash = computeHash(videoEl);

  // Load + hash the reference (cached after first load)
  const refHash = await getRefHash(refImageUrl);

  if (!liveHash || !refHash) return 0;

  const dist = hammingDistance(liveHash, refHash);
  // Convert distance to similarity (0-1)
  // Typical same-scene match: dist < 0.35
  // Different scene: dist > 0.45
  return Math.max(0, Math.min(1, 1 - dist * 2.5));
}

// Cache reference hashes to avoid recomputing
const refCache = new Map();

async function getRefHash(url) {
  if (refCache.has(url)) return refCache.get(url);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const hash = computeHash(img);
      refCache.set(url, hash);
      resolve(hash);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Compute hash directly from a video element (for live comparison loop).
 * Returns the hash array, not similarity.
 */
export function hashFrame(videoEl) {
  if (!videoEl || !videoEl.videoWidth) return null;
  return computeHash(videoEl);
}

/**
 * Compare two hashes. Returns similarity 0-1.
 */
export function compareSimilarity(hashA, hashB) {
  const dist = hammingDistance(hashA, hashB);
  return Math.max(0, Math.min(1, 1 - dist * 2.5));
}
