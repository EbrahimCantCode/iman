// Renders Iman's app icons (a gold mihrab arch with a crescent on deep teal)
// to PNG with no dependencies: shapes are signed distance functions,
// anti-aliased by 4x4 supersampling and encoded with node:zlib.
//
//   node scripts/make-icons.mjs
//
// Outputs assets/icons/: icon-192.png, icon-512.png (rounded, "any"),
// maskable-512.png (full bleed, safe zone), apple-touch-icon.png (180),
// badge-96.png (white silhouette for Android notification badges).

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
mkdirSync(out, { recursive: true });

// ------------------------------------------------------------ PNG encoder

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------ scene

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const BG_A = hex('#145150');
const BG_B = hex('#05191a');
const GOLD_A = hex('#f3cf7a');
const GOLD_B = hex('#d49a32');
const NICHE = hex('#0e3433');

const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const len = (x, y) => Math.hypot(x, y);

function sdRoundRect(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdBox(x, y, x0, y0, x1, y1) {
  return sdRoundRect(x, y, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0);
}

// Pointed (mihrab) arch: span 0.27..0.73, springing line 0.47, floor 0.80.
const ARCH = { x0: 0.27, x1: 0.73, spring: 0.47, floor: 0.8, r: 0.32 };
function sdArch(x, y) {
  const { x0, x1, spring, floor, r } = ARCH;
  const cl = x1 - r; // centre of the right-hand arc (draws the left side)
  const cr = x0 + r;
  // Intersection of the two arc discs; below the springing line it lies
  // inside the body box, so the union has no seam.
  const lens = Math.max(len(x - cr, y - spring) - r, len(x - cl, y - spring) - r);
  const body = sdBox(x, y, x0, spring, x1, floor);
  return Math.min(lens, body);
}

function sdCrescent(x, y) {
  const outer = len(x - 0.49, y - 0.54) - 0.13;
  const inner = len(x - 0.545, y - 0.505) - 0.112;
  return Math.max(outer, -inner);
}

/**
 * Colour at (x, y) in unit space, or null for transparent.
 * @param {{bleed: boolean, scale: number, mono: boolean}} o
 */
function shade(px, py, o) {
  // Content is scaled around the centre (maskable icons keep a safe zone).
  const x = (px - 0.5) / o.scale + 0.5;
  const y = (py - 0.5) / o.scale + 0.5;
  const stroke = 0.045;
  const arch = sdArch(x, y);
  const floor = sdBox(x, y, 0.2, ARCH.floor - 0.006, 0.8, ARCH.floor + 0.034);
  const crescent = sdCrescent(x, y);
  const star = len(x - 0.6, y - 0.415) - 0.024;
  const gold = Math.min(Math.abs(arch) - stroke / 2, floor, crescent, star);

  if (o.mono) return gold <= 0 ? [1, 1, 1] : null;

  if (!o.bleed && sdRoundRect(px, py, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) return null;
  if (gold <= 0) return mix(GOLD_A, GOLD_B, Math.min(1, Math.max(0, (y - 0.15) / 0.7)));
  if (arch < 0) return NICHE;
  // Background: diagonal gradient with a warm glow behind the arch.
  const t = Math.min(1, Math.max(0, (px + py) / 2));
  let c = mix(BG_A, BG_B, t);
  const glow = Math.max(0, 1 - len(px - 0.5, py - 0.35) / 0.55) ** 2 * 0.18;
  c = mix(c, GOLD_A, glow);
  return c;
}

function render(size, o) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = shade((i + (sx + 0.5) / S) / size, (j + (sy + 0.5) / S) / size, o);
          if (!c) continue;
          r += c[0];
          g += c[1];
          b += c[2];
          a += 1;
        }
      }
      const k = (j * size + i) * 4;
      const n = S * S;
      buf[k] = a ? Math.round((r / a) * 255) : 0;
      buf[k + 1] = a ? Math.round((g / a) * 255) : 0;
      buf[k + 2] = a ? Math.round((b / a) * 255) : 0;
      buf[k + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, buf);
}

const ICONS = [
  ['icon-192.png', 192, { bleed: false, scale: 0.92, mono: false }],
  ['icon-512.png', 512, { bleed: false, scale: 0.92, mono: false }],
  ['maskable-512.png', 512, { bleed: true, scale: 0.72, mono: false }],
  ['apple-touch-icon.png', 180, { bleed: true, scale: 0.86, mono: false }],
  ['badge-96.png', 96, { bleed: true, scale: 1.05, mono: true }],
];

for (const [name, size, o] of ICONS) {
  const png = render(size, o);
  writeFileSync(join(out, name), png);
  console.log(`${name}: ${size}x${size}, ${png.length} bytes`);
}
