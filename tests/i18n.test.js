import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import en from '../js/i18n/en.js';
import ar from '../js/i18n/ar.js';
import {
  useLanguage,
  t,
  tn,
  digits,
  resolveLanguage,
  LANGUAGE_CODES,
  fmtNum,
} from '../js/i18n/index.js';
import { SCHEMA } from '../js/config/schema.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLURAL = /\.(zero|one|two|few|many|other)$/;
const placeholders = (s) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const PACKS = { en, ar };

describe('language packs', () => {
  test('every registered language has a pack with metadata', () => {
    for (const code of LANGUAGE_CODES) {
      const pack = PACKS[code];
      assert.ok(pack, code);
      assert.equal(pack.code, code);
      assert.ok(['ltr', 'rtl'].includes(pack.dir));
    }
  });

  for (const [code, pack] of Object.entries(PACKS)) {
    if (code === 'en') continue;

    test(`${code} translates every English string`, () => {
      const missing = Object.keys(en.strings).filter((k) => {
        if (k in pack.strings) return false;
        // A plural key is covered if the pack has its own ".other".
        return !(PLURAL.test(k) && k.replace(PLURAL, '.other') in pack.strings);
      });
      assert.deepEqual(missing, []);
    });

    test(`${code} has no keys that English lacks`, () => {
      const extra = Object.keys(pack.strings).filter(
        (k) => !(k in en.strings) && !(PLURAL.test(k) && k.replace(PLURAL, '.other') in en.strings),
      );
      assert.deepEqual(extra, []);
    });

    test(`${code} keeps the same {placeholders}`, () => {
      for (const [k, v] of Object.entries(pack.strings)) {
        const ref = en.strings[k] ?? en.strings[k.replace(PLURAL, '.other')];
        const mine = placeholders(v);
        const theirs = placeholders(ref);
        if (PLURAL.test(k)) {
          // "one"/"two" forms may spell the number out ("يومان").
          for (const p of mine) assert.ok(theirs.has(p), `${k}: unknown {${p}}`);
        } else {
          assert.deepEqual([...mine].sort(), [...theirs].sort(), k);
        }
      }
    });
  }
});

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

describe('keys used in code', () => {
  test('every literal t()/tn() key exists in English', () => {
    const missing = [];
    for (const file of walk('js').filter((f) => f.endsWith('.js') && !f.includes('/i18n/'))) {
      const src = readFileSync(join(root, file), 'utf8');
      for (const m of src.matchAll(/\bt(?:n)?\(\s*'([\w.-]+)'/g)) {
        const key = m[1];
        const ok = key in en.strings || `${key}.other` in en.strings;
        if (!ok) missing.push(`${file}: ${key}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test('every setting has a label and every option a translation', () => {
    const missing = [];
    for (const def of SCHEMA) {
      if (def.hidden) continue;
      if (!(def.label in en.strings)) missing.push(def.label);
      for (const o of def.options ?? []) {
        const key = def.optionLabel(o);
        if (!(key in en.strings)) missing.push(key);
      }
    }
    assert.deepEqual(missing, []);
  });
});

describe('formatting', () => {
  test('falls back to English and interpolates', () => {
    useLanguage(ar);
    assert.equal(t('tab.today'), 'اليوم');
    assert.equal(t('no.such.key'), 'no.such.key');
    assert.equal(
      t('today.endsIn', { prayer: 'العصر', duration: '٥ د' }),
      'ينتهي وقت العصر بعد ٥ د',
    );
    useLanguage(en);
  });

  test('Arabic plurals and numerals', () => {
    useLanguage(ar);
    assert.equal(tn('tracker.days', 1), 'يوم واحد');
    assert.equal(tn('tracker.days', 2), 'يومان');
    assert.equal(tn('tracker.days', 3), '٣ أيام');
    assert.equal(tn('tracker.days', 11), '١١ يومًا');
    assert.equal(tn('tracker.days', 100), '١٠٠ يوم');
    assert.equal(digits('04:18:09'), '٠٤:١٨:٠٩');
    useLanguage(ar, { numerals: 'latn' });
    assert.equal(tn('tracker.days', 3), '3 أيام');
    assert.equal(digits('04:18'), '04:18');
    useLanguage(en);
  });

  test('English plurals', () => {
    useLanguage(en);
    assert.equal(tn('tracker.days', 1), '1 day');
    assert.equal(tn('tracker.days', 5), '5 days');
    assert.equal(fmtNum(1217), '1,217');
  });

  test('language resolution follows the device when set to auto', () => {
    assert.equal(resolveLanguage('auto', ['ar-BH', 'en-US']), 'ar');
    assert.equal(resolveLanguage('auto', ['fr-FR', 'en-GB']), 'en');
    assert.equal(resolveLanguage('auto', ['de-DE']), 'en');
    assert.equal(resolveLanguage('ar', ['en-US']), 'ar');
  });
});
