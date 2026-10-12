// Builds data/cities.json from GeoNames dumps (CC BY 4.0, https://www.geonames.org/).
//
//   1. Download into an empty folder:
//        https://download.geonames.org/export/dump/cities15000.zip  (unzip)
//        https://download.geonames.org/export/dump/cities5000.zip   (unzip)
//        https://download.geonames.org/export/dump/admin1CodesASCII.txt
//   2. node scripts/build-cities.mjs <that-folder>
//
// Included: every city with population >= 15,000 (plus capitals), and every
// place >= 5,000 in the GCC countries. Arabic names are picked from GeoNames
// alternate names with a small heuristic; fix any wrong ones in AR_OVERRIDES.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-cities.mjs <geonames-folder>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const GCC = new Set(['BH', 'SA', 'AE', 'KW', 'QA', 'OM']);

/** geonameid -> Arabic name, for well-known cities where the heuristic picks a variant. */
const AR_OVERRIDES = {
  104515: 'مكة المكرمة', // Mecca
  109223: 'المدينة المنورة', // Medina
  1850147: 'طوكيو', // Tokyo
  745044: 'إسطنبول', // Istanbul
  281184: 'القدس', // Jerusalem
  2643743: 'لندن', // London
};

const ARABIC_ONLY = /^[ء-غف-ي -]+$/; // tested after removing tashkeel
const TASHKEEL = /[ً-ْٰ]/g;

/** Pick the most standard-looking Arabic spelling from GeoNames alternate names. */
function pickArabic(alternates) {
  const cands = [
    ...new Set(
      alternates
        .split(',')
        .map((a) => a.replace(TASHKEEL, '').trim())
        .filter((a) => ARABIC_ONLY.test(a) && /[ء-ي]/.test(a)),
    ),
  ];
  if (!cands.length) return '';
  const has = (s) => cands.includes(s);
  const score = (s) => {
    let v = 0;
    if (s.startsWith('ال')) v += 2;
    if (s.endsWith('ة')) v += 1;
    if (s.endsWith('ه') && has(s.slice(0, -1) + 'ة')) v -= 2;
    if (s.endsWith('ى') && has(s.slice(0, -1) + 'ي')) v -= 2;
    if (/.أ/.test(s)) v -= 2; // odd transliterations like "لأندأن"
    if (s.startsWith('مدينة ')) v -= 1;
    return v;
  };
  cands.sort((a, b) => score(b) - score(a) || a.length - b.length);
  return cands[0];
}

const admin1 = new Map();
for (const line of readFileSync(join(src, 'admin1CodesASCII.txt'), 'utf8').split('\n')) {
  const [code, name] = line.split('\t');
  if (code) admin1.set(code, name);
}

const cities = new Map();
function addFrom(file, accept) {
  for (const line of readFileSync(join(src, file), 'utf8').split('\n')) {
    const c = line.split('\t');
    if (c.length < 18) continue;
    const id = Number(c[0]);
    const cc = c[8];
    if (cities.has(id) || !accept(cc, c)) continue;
    cities.set(id, {
      id,
      name: c[1],
      ar: AR_OVERRIDES[id] ?? pickArabic(c[3]),
      cc,
      admin: admin1.get(`${cc}.${c[10]}`) ?? '',
      lat: Number(Number(c[4]).toFixed(3)),
      lon: Number(Number(c[5]).toFixed(3)),
      tz: c[17],
      pop: Number(c[14]) || 0,
    });
  }
}

addFrom('cities15000.txt', () => true);
addFrom('cities5000.txt', (cc) => GCC.has(cc));

const list = [...cities.values()].filter((c) => c.tz).sort((a, b) => b.pop - a.pop);
const zones = [...new Set(list.map((c) => c.tz))].sort();
const zoneIndex = new Map(zones.map((z, i) => [z, i]));

const payload = {
  v: 1,
  source: 'GeoNames (https://www.geonames.org/), CC BY 4.0',
  tz: zones,
  rows: list.map((c) => [
    c.name,
    c.ar,
    c.cc,
    c.admin === c.name ? '' : c.admin,
    c.lat,
    c.lon,
    zoneIndex.get(c.tz),
    Math.round(c.pop / 1000),
  ]),
};

const out = join(root, 'data', 'cities.json');
writeFileSync(out, JSON.stringify(payload));
const bytes = Buffer.byteLength(JSON.stringify(payload));
const gcc = list.filter((c) => GCC.has(c.cc)).length;
const withAr = list.filter((c) => c.ar).length;
console.log(
  `wrote ${out}: ${list.length} cities (${gcc} in the GCC, ${withAr} with Arabic names), ` +
    `${zones.length} time zones, ${(bytes / 1024 / 1024).toFixed(2)} MB`,
);
