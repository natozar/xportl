/**
 * NSFW image filter — runs entirely in the browser via TensorFlow.js.
 * Zero server cost. Model loaded once and cached by the browser.
 */

let nsfwModel = null;
let loadingPromise = null;

/**
 * Lazy-load the NSFW model (only when first photo is captured).
 * Subsequent calls return the cached model instantly.
 */
async function getModel() {
  if (nsfwModel) return nsfwModel;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Dynamic import so TF.js doesn't bloat the initial bundle
    const [tf, nsfwjs] = await Promise.all([
      import('@tensorflow/tfjs'),
      import('nsfwjs'),
    ]);

    // Use the MobileNet v2 model (smallest, ~100KB quantized)
    nsfwModel = await nsfwjs.default.load(
      'https://raw.githack.com/nicedoc/nsfwjs/master/example/nsfw_demo/public/quant_nsfw_mobilenet/',
      { size: 224 }
    );

    console.log('[XPortl] NSFW model loaded');
    return nsfwModel;
  })();

  return loadingPromise;
}

/**
 * Classify an image for NSFW content.
 *
 * @param {string} imageDataUrl - base64 data URL of the image (from canvas.toDataURL)
 * @returns {Promise<{ safe: boolean, blocked: boolean, reason: string|null, scores: Object }>}
 */
export async function classifyImage(imageDataUrl) {
  try {
    const model = await getModel();

    // Create an offscreen image element for classification
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = imageDataUrl;
    });

    const predictions = await model.classify(img);

    // Build scores map: { Porn: 0.02, Sexy: 0.1, Hentai: 0.01, Neutral: 0.8, Drawing: 0.07 }
    const scores = {};
    for (const p of predictions) {
      scores[p.className] = p.probability;
    }

    // Tolerance gate: block if Porn + Hentai > 50%
    const nsfwScore = (scores.Porn || 0) + (scores.Hentai || 0);
    const sexyScore = scores.Sexy || 0;

    // Block conditions:
    // 1. Porn + Hentai combined > 50%
    // 2. Porn alone > 30% (strict on explicit content)
    // 3. Sexy > 70% (very suggestive)
    const blocked =
      nsfwScore > 0.5 ||
      (scores.Porn || 0) > 0.3 ||
      sexyScore > 0.7;

    return {
      safe: !blocked,
      blocked,
      reason: blocked
        ? 'Bloqueado: Nosso filtro inteligente detectou nudez ou conteudo inadequado nesta foto. Conteudos explicitos sao rigorosamente proibidos nesta dimensao.'
        : null,
      scores,
    };
  } catch (err) {
    console.error('[XPortl] NSFW classification failed:', err);
    // Fail-open: if the model fails to load, allow the image
    // (server-side moderation + user reports are the backup)
    return { safe: true, blocked: false, reason: null, scores: {} };
  }
}

/**
 * Preload the model in background (call early for better UX).
 * Non-blocking — doesn't throw.
 */
export function preloadNsfwModel() {
  getModel().catch(() => {});
}
