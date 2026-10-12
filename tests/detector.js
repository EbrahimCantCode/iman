// Detector test bench: confidence scores for still images (see detector.html).

import {
  loadDetector,
  detectObjects,
  pickDetection,
  canvasHistogram,
  histogramSimilarity,
} from '../js/sink-check.js';

const status = document.getElementById('status');
const table = document.getElementById('results');
const THRESHOLD = 0.6;
let reference = null;

function row(cells, tag = 'td') {
  const tr = document.createElement('tr');
  for (const c of cells) {
    const cell = document.createElement(tag);
    cell.textContent = c;
    tr.append(cell);
  }
  table.append(tr);
}

function toCanvas(img, maxSide = 640) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const results = [];

async function run(name, src) {
  const canvas = toCanvas(await loadImage(src));
  const full = pickDetection(await detectObjects(canvas, [1]), ['sink'], THRESHOLD);
  const t0 = performance.now();
  // Same multi-scale detection as the wake check.
  const preds = await detectObjects(canvas);
  const ms = Math.round(performance.now() - t0);
  const sink = pickDetection(preds, ['sink'], THRESHOLD);
  const toilet = pickDetection(preds, ['toilet'], THRESHOLD);
  const hist = canvasHistogram(canvas);
  if (!reference && sink.pass) reference = { name, hist };
  const sim = reference ? histogramSimilarity(hist, reference.hist).toFixed(2) : '—';
  const top = preds
    .slice(0, 4)
    .map((p) => `${p.class} ${p.score.toFixed(2)}`)
    .join(', ');
  const result = {
    name,
    sinkFullFrame: full.best?.score ?? 0,
    sink: sink.best?.score ?? 0,
    toilet: toilet.best?.score ?? 0,
    pass: sink.pass,
    top,
    sim,
    ms,
  };
  results.push(result);
  row([
    name,
    full.best ? full.best.score.toFixed(2) : '—',
    sink.best ? sink.best.score.toFixed(2) : '—',
    toilet.best ? toilet.best.score.toFixed(2) : '—',
    sink.pass ? 'PASS' : 'fail',
    top || 'nothing',
    sim,
    `${ms} ms`,
  ]);
  window.__results = results;
}

row(
  [
    'image',
    'sink (full frame)',
    'sink',
    'toilet',
    `@${THRESHOLD}`,
    'top detections',
    'colour sim.',
    'time',
  ],
  'th',
);

const names = (new URLSearchParams(location.search).get('images') || '')
  .split(',')
  .filter((n) => /^[\w.-]+\.(jpe?g|png|webp)$/i.test(n));

loadDetector()
  .then(async () => {
    status.textContent = 'Model ready.';
    for (const n of names) await run(n, `fixtures/local/${n}`);
    status.textContent = names.length ? 'Done.' : 'Model ready. Pick some images.';
    window.__done = true;
  })
  .catch((err) => (status.textContent = `Model failed to load: ${err.message}`));

document.getElementById('files').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    const url = URL.createObjectURL(file);
    await run(file.name, url);
    URL.revokeObjectURL(url);
  }
});
