// Copies the runtime dependencies from node_modules into lib/ so the app runs
// fully offline with no build step. Run after `npm install` or a version bump:
//
//   npm run vendor            # copy JS bundles
//   npm run vendor -- --model # also (re)download the COCO-SSD model weights
//
// The model weights are not on npm; they are fetched once from the official
// TensorFlow.js model bucket and committed to lib/coco-ssd/model/.

import { copyFile, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const lib = (p) => join(root, 'lib', p);

const FILES = [
  ['adhan/lib/bundles/adhan.esm.min.js', 'adhan/adhan.esm.min.js'],
  ['adhan/LICENSE', 'adhan/LICENSE'],
  ['@tensorflow/tfjs/dist/tf.es2017.min.js', 'tfjs/tf.min.js'],
  ['@tensorflow-models/coco-ssd/dist/coco-ssd.min.js', 'coco-ssd/coco-ssd.min.js'],
];

const MODEL_BASE = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/';

async function copyBundles() {
  for (const [from, to] of FILES) {
    await mkdir(dirname(lib(to)), { recursive: true });
    if (to.endsWith('.js')) {
      // Drop the sourceMappingURL comment: we don't ship maps, and a dangling
      // reference only produces 404 noise in devtools.
      const src = await readFile(nm(from), 'utf8');
      await writeFile(lib(to), src.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n'));
    } else {
      await copyFile(nm(from), lib(to));
    }
    console.log(`copied ${from} -> lib/${to}`);
  }
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchModel() {
  const dir = lib('coco-ssd/model');
  await mkdir(dir, { recursive: true });
  const res = await fetch(MODEL_BASE + 'model.json');
  if (!res.ok) throw new Error(`model.json: HTTP ${res.status}`);
  const manifestText = await res.text();
  const manifest = JSON.parse(manifestText);
  await writeFile(join(dir, 'model.json'), manifestText);

  let expected = 0;
  for (const group of manifest.weightsManifest) {
    for (const w of group.weights) {
      const n = w.shape.reduce((a, b) => a * b, 1);
      const bytes = w.quantization ? { uint8: 1, uint16: 2, float16: 2 }[w.quantization.dtype] : 4;
      expected += n * bytes;
    }
  }

  let total = 0;
  for (const group of manifest.weightsManifest) {
    for (const path of group.paths) {
      const r = await fetch(MODEL_BASE + path);
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      total += buf.length;
      await writeFile(join(dir, path), buf);
      const sha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      console.log(`downloaded ${path} (${buf.length} bytes, sha256 ${sha}…)`);
    }
  }
  if (total !== expected) {
    throw new Error(`Weight size mismatch: got ${total} bytes, manifest expects ${expected}`);
  }
  console.log(`model OK: ${total} bytes of weights`);
}

await copyBundles();
if (process.argv.includes('--model') || !(await exists(lib('coco-ssd/model/model.json')))) {
  await fetchModel();
}
