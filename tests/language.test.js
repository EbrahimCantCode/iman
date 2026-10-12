import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDocumentLanguage,
  t,
  fmtDate,
  currentLanguage,
  useLanguage,
} from '../js/i18n/index.js';
import en from '../js/i18n/en.js';
import ar from '../js/i18n/ar.js';
import { createSettingsStore, defaultValues } from '../js/settings.js';
import { createMemoryStorage } from '../js/storage.js';
import { buildWakeLink } from '../js/wake-params.js';
import { SCHEMA_BY_KEY, SCHEMA } from '../js/config/schema.js';

const fakeDocument = () => ({ documentElement: { lang: 'en', dir: 'ltr' } });

describe('switching language (no reload)', () => {
  test('English ↔ Arabic updates text, dir and lang in place', async () => {
    const doc = fakeDocument();
    await applyDocumentLanguage(doc, 'ar');
    assert.equal(doc.documentElement.lang, 'ar');
    assert.equal(doc.documentElement.dir, 'rtl');
    assert.equal(t('set.travel.enabled'), 'وضع السفر');
    assert.equal(t('flight.title'), 'أوقات الصلاة في الطائرة');
    // Dates use Arabic month names (and Arabic-Indic digits by default).
    assert.match(
      fmtDate(new Date('2026-10-12T12:00:00Z'), 'UTC', { month: 'long' }),
      /أكتوبر|تشرين/,
    );

    await applyDocumentLanguage(doc, 'en');
    assert.equal(doc.documentElement.lang, 'en');
    assert.equal(doc.documentElement.dir, 'ltr');
    assert.equal(t('set.travel.enabled'), 'Travel mode');
  });

  test('"Follow device" picks the device language', async () => {
    const doc = fakeDocument();
    assert.equal(await applyDocumentLanguage(doc, 'auto', { navLanguages: ['ar-BH', 'en'] }), 'ar');
    assert.equal(doc.documentElement.dir, 'rtl');
    assert.equal(await applyDocumentLanguage(doc, 'auto', { navLanguages: ['fr-FR'] }), 'en');
    assert.equal(doc.documentElement.dir, 'ltr');
  });

  test('numerals follow their own setting', async () => {
    const doc = fakeDocument();
    await applyDocumentLanguage(doc, 'ar', { numerals: 'latn' });
    assert.equal(t('travel.dayN', { n: 3 }), 'اليوم 3 من رحلتك');
    await applyDocumentLanguage(doc, 'ar', { numerals: 'arab' });
    assert.equal(t('travel.dayN', { n: 3 }), 'اليوم ٣ من رحلتك');
    await applyDocumentLanguage(doc, 'en', { numerals: 'arab' });
    assert.equal(t('travel.dayN', { n: 3 }), 'Day ٣ of your trip');
    useLanguage(en);
  });

  test('the choice is saved and restored after a restart', async () => {
    const storage = createMemoryStorage();
    createSettingsStore({ storage }).set('appearance.language', 'ar');
    // "Restart": a new store reads the same storage.
    const restarted = createSettingsStore({ storage });
    assert.equal(restarted.get('appearance.language'), 'ar');
    const doc = fakeDocument();
    await applyDocumentLanguage(doc, restarted.get('appearance.language'));
    assert.equal(doc.documentElement.dir, 'rtl');
    assert.equal(currentLanguage(), 'ar');
    useLanguage(en);
  });
});

describe('language option and terms', () => {
  test('Language is the first setting in Appearance', () => {
    const appearance = SCHEMA.filter((d) => d.section === 'appearance');
    assert.equal(appearance[0].key, 'appearance.language');
    assert.deepEqual(SCHEMA_BY_KEY.get('appearance.language').options, ['auto', 'en', 'ar']);
  });

  test('each language is named in its own language, whatever the app language', () => {
    for (const pack of [en, ar]) {
      assert.equal(pack.strings['opt.appearance.language.en'], 'English');
      assert.equal(pack.strings['opt.appearance.language.ar'], 'العربية');
    }
  });

  test('Arabic uses the correct travel terms', () => {
    const all = Object.values(ar.strings).join(' ');
    for (const term of ['قصر', 'جمع تقديم', 'جمع تأخير', 'مسافر'])
      assert.ok(all.includes(term), term);
  });

  test('the wake check link carries the language in use', () => {
    const base = 'https://x.test/iman/wake.html';
    const link = (values, lang) =>
      new URL(buildWakeLink(base, values, lang)).searchParams.get('lang');
    assert.equal(link({ ...defaultValues(), 'appearance.language': 'auto' }, 'ar'), 'ar');
    assert.equal(link({ ...defaultValues(), 'appearance.language': 'en' }, 'ar'), 'en');
    assert.equal(link({ ...defaultValues(), 'appearance.language': 'auto' }, null), null);
  });
});
