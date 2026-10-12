// Sink detection for the wake check: live camera only (no gallery uploads),
// on-device object detection with TensorFlow.js + COCO-SSD (COCO has a
// "sink" class), and an optional reference-photo check using a small colour
// histogram. Frames are processed in memory only, never saved or uploaded.

// ---------------------------------------------------------------- pure helpers

/**
 * Best accepted detection. Passes when one of `objects` is detected with a
 * score >= threshold.
 */
export function pickDetection(predictions, objects, threshold) {
  let best = null;
  for (const p of predictions ?? []) {
    if (!objects.includes(p.class)) continue;
    if (!best || p.score > best.score) best = { class: p.class, score: p.score };
  }
  return { pass: Boolean(best && best.score >= threshold), best };
}

const HUE_BINS = 8;
export const HIST_BINS = 4 + HUE_BINS * 2 * 2;

/** RGB (0-255) -> [h 0-360, s 0-1, v 0-1]. */
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, v];
}

/**
 * A 36-bin colour histogram: 4 grey levels for unsaturated pixels plus
 * 8 hues x 2 saturations x 2 brightnesses. Normalised to sum 1.
 * @param {Uint8ClampedArray} data RGBA pixels
 */
export function colorHistogram(data, step = 1) {
  const bins = new Float64Array(HIST_BINS);
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    let bin;
    if (s < 0.2 || v < 0.15) bin = Math.min(3, Math.floor(v * 4));
    else {
      const hue = Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)));
      bin = 4 + hue * 4 + (s >= 0.55 ? 2 : 0) + (v >= 0.6 ? 1 : 0);
    }
    bins[bin] += 1;
    n += 1;
  }
  return Array.from(bins, (x) => (n ? x / n : 0));
}

/**
 * Similarity in [0, 1] (Bhattacharyya coefficient = cosine of sqrt vectors),
 * 1 for identical colour distributions.
 */
export function histogramSimilarity(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = Math.sqrt(a[i]);
    const y = Math.sqrt(b[i]);
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Encode a histogram as compact base64url (sqrt-scaled bytes) for the wake link. */
export function encodeHistogram(hist) {
  const bytes = hist.map((p) => Math.round(Math.sqrt(p) * 255));
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    const chars = [B64[(n >> 18) & 63], B64[(n >> 12) & 63], B64[(n >> 6) & 63], B64[n & 63]];
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}

/** Decode encodeHistogram output back to a (normalised) histogram, or null. */
export function decodeHistogram(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const bytes = [];
  for (let i = 0; i < str.length; i += 4) {
    const chunk = str.slice(i, i + 4);
    let n = 0;
    for (let j = 0; j < 4; j++) n = (n << 6) | (j < chunk.length ? B64.indexOf(chunk[j]) : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  if (bytes.length !== HIST_BINS) return null;
  const p = bytes.map((b) => (b / 255) ** 2);
  const sum = p.reduce((a, b) => a + b, 0);
  return sum ? p.map((x) => x / sum) : null;
}

// ---------------------------------------------------------------- browser side

// Resolved against this module so any page (app, wake.html, tests) can load them.
const lib = (path) => new URL(`../lib/${path}`, import.meta.url).href;
const MODEL_URL = lib('coco-ssd/model/model.json');
let detectorPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-src="${src}"]`);
    if (existing?.dataset.loaded) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.dataset.src = src;
    s.async = false;
    s.onload = () => {
      s.dataset.loaded = '1';
      resolve();
    };
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

/**
 * Lazy-load TensorFlow.js and the COCO-SSD model (only on the wake page).
 * Everything comes from lib/, so it works offline once cached.
 */
export function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      await loadScript(lib('tfjs/tf.min.js'));
      await loadScript(lib('coco-ssd/coco-ssd.min.js'));
      const { tf, cocoSsd } = globalThis;
      tf.enableProdMode();
      try {
        await tf.setBackend('webgl');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
      return cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: MODEL_URL });
    })().catch((err) => {
      detectorPromise = null;
      throw err;
    });
  }
  return detectorPromise;
}

/**
 * Start the rear camera in a <video> element.
 * Rejects with code "unsupported" | "denied" | "unavailable".
 */
export async function startCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Camera API unavailable'), { code: 'unsupported' });
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
  } catch (err) {
    const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
    throw Object.assign(new Error(err?.message || 'camera error'), {
      code: denied ? 'denied' : 'unavailable',
    });
  }
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  return {
    stream,
    stop() {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

/** Draw the current video frame into a canvas (longest side <= maxSide). */
export function captureFrame(video, canvas, maxSide = 640) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Colour histogram of a canvas, computed on a small copy. */
export function canvasHistogram(canvas) {
  const small = document.createElement('canvas');
  small.width = 96;
  small.height = Math.max(1, Math.round((96 * canvas.height) / canvas.width));
  const g = small.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, small.width, small.height);
  return colorHistogram(g.getImageData(0, 0, small.width, small.height).data);
}

/**
 * The lite SSD model works at a low internal resolution, so objects that
 * are small in the frame are easily missed. Besides the full frame we also
 * scan two centre crops and keep every prediction (tested on sample photos:
 * this lifted a distant toilet from 0.23 to 0.94 without raising the scores
 * of counters, walls or empty scenes).
 */
export const DETECTION_SCALES = Object.freeze([1, 0.75, 0.55]);

function centerCrop(canvas, f) {
  if (f === 1) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * f);
  c.height = Math.round(canvas.height * f);
  c.getContext('2d').drawImage(
    canvas,
    (canvas.width - c.width) / 2,
    (canvas.height - c.height) / 2,
    c.width,
    c.height,
    0,
    0,
    c.width,
    c.height,
  );
  return c;
}

/** Detect objects at several scales; predictions carry the crop factor used. */
export async function detectObjects(canvas, scales = DETECTION_SCALES) {
  const model = await loadDetector();
  const all = [];
  for (const f of scales) {
    for (const p of await model.detect(centerCrop(canvas, f), 20, 0.2))
      all.push({ ...p, scale: f });
  }
  return all.sort((a, b) => b.score - a.score);
}

/**
 * Run detection on a captured canvas.
 * @returns {Promise<{pass: boolean, best: object|null, predictions: object[], similarity: number|null}>}
 */
export async function checkFrame(canvas, { objects, threshold, refHist, refThreshold }) {
  const predictions = await detectObjects(canvas);
  const { pass, best } = pickDetection(predictions, objects, threshold);
  let similarity = null;
  let ok = pass;
  if (pass && refHist) {
    similarity = histogramSimilarity(canvasHistogram(canvas), refHist);
    ok = similarity >= refThreshold;
  }
  return { pass: ok, detected: pass, best, predictions, similarity };
}
