import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS } from '../js/config/defaults.js';
import { SCHEMA, SCHEMA_BY_KEY, SETTINGS_VERSION, SECTIONS } from '../js/config/schema.js';
import {
  validateValue,
  validateAll,
  migrate,
  defaultValues,
  buildSettingsExport,
  parseSettingsImport,
  createSettingsStore,
  MAX_IMPORT_BYTES,
} from '../js/settings.js';
import { createMemoryStorage } from '../js/storage.js';

const def = (key) => SCHEMA_BY_KEY.get(key);

describe('schema and defaults', () => {
  test('every schema entry has a default and every default has a schema entry', () => {
    const schemaKeys = new Set(SCHEMA.map((e) => e.key));
    const defaultKeys = new Set(Object.keys(DEFAULTS));
    for (const k of schemaKeys) assert.ok(defaultKeys.has(k), `missing default for ${k}`);
    for (const k of defaultKeys) assert.ok(schemaKeys.has(k), `stray default ${k}`);
    assert.equal(schemaKeys.size, SCHEMA.length, 'duplicate schema keys');
  });

  test('every default passes its own validation unchanged', () => {
    for (const e of SCHEMA) {
      assert.deepEqual(validateValue(e, e.default), e.default, e.key);
    }
  });

  test('every entry has a known type and section', () => {
    const types = ['number', 'boolean', 'select', 'multiselect', 'time', 'text'];
    for (const e of SCHEMA) {
      assert.ok(types.includes(e.type), `${e.key} type`);
      assert.ok(SECTIONS.includes(e.section), `${e.key} section`);
      if (e.type === 'number') assert.ok(e.min < e.max, `${e.key} range`);
      if (e.type === 'select' || e.type === 'multiselect') assert.ok(e.options.length > 0);
    }
  });
});

describe('validateValue', () => {
  test('clamps numbers to min/max', () => {
    assert.equal(validateValue(def('prayer.adjust.fajr'), 99), 30);
    assert.equal(validateValue(def('prayer.adjust.fajr'), -99), -30);
    assert.equal(validateValue(def('focus.duration'), 1), 5);
  });

  test('snaps numbers to the step', () => {
    assert.equal(validateValue(def('reminders.fajr.before'), 7), 5);
    assert.equal(validateValue(def('reminders.fajr.before'), 8), 10);
    assert.equal(validateValue(def('wake.threshold'), 0.62), 0.6);
    assert.equal(validateValue(def('wake.threshold'), 0.99), 0.95);
    assert.equal(validateValue(def('prayer.customFajrAngle'), 18.26), 18.3);
  });

  test('coerces numeric strings (URL params) and rejects junk', () => {
    assert.equal(validateValue(def('wake.attempts'), '7'), 7);
    assert.equal(validateValue(def('wake.attempts'), 'seven'), 5);
    assert.equal(validateValue(def('wake.attempts'), ''), 5);
    assert.equal(validateValue(def('wake.attempts'), NaN), 5);
    assert.equal(validateValue(def('wake.attempts'), Infinity), 5);
    assert.equal(validateValue(def('wake.attempts'), {}), 5);
    assert.equal(validateValue(def('wake.attempts'), [7]), 5);
  });

  test('nullable numbers accept null, others fall back', () => {
    assert.equal(validateValue(def('location.lat'), null), null);
    assert.equal(validateValue(def('location.lat'), 26.2235), 26.2235);
    assert.equal(validateValue(def('location.lat'), 123), 90);
    assert.equal(validateValue(def('focus.duration'), null), 15);
  });

  test('never produces negative zero', () => {
    assert.ok(Object.is(validateValue(def('prayer.adjust.isha'), -0.2), 0));
  });

  test('booleans accept real booleans and string forms', () => {
    const d = def('focus.enabled');
    assert.equal(validateValue(d, false), false);
    assert.equal(validateValue(d, 'false'), false);
    assert.equal(validateValue(d, '1'), true);
    assert.equal(validateValue(d, 'yes'), true); // invalid -> default (true)
    assert.equal(validateValue(def('wake.enabled'), 'yes'), false);
  });

  test('selects only accept listed options', () => {
    assert.equal(validateValue(def('prayer.method'), 'Kuwait'), 'Kuwait');
    assert.equal(validateValue(def('prayer.method'), 'kuwait'), 'auto');
    assert.equal(validateValue(def('prayer.method'), '__proto__'), 'auto');
  });

  test('multiselects filter unknown values, dedupe, keep option order and respect minItems', () => {
    const d = def('focus.prayers');
    assert.deepEqual(validateValue(d, ['isha', 'fajr', 'fajr', 'bogus']), ['fajr', 'isha']);
    assert.deepEqual(validateValue(d, 'asr,dhuhr'), ['dhuhr', 'asr']);
    assert.deepEqual(validateValue(d, []), []); // focus.prayers may be empty
    assert.deepEqual(validateValue(def('wake.objects'), []), ['sink']); // minItems 1
    assert.deepEqual(validateValue(def('wake.objects'), 'toilet,sink'), ['sink', 'toilet']);
  });

  test('times must be HH:MM', () => {
    const d = def('reminders.quietStart');
    assert.equal(validateValue(d, '23:15'), '23:15');
    assert.equal(validateValue(d, '24:00'), '22:00');
    assert.equal(validateValue(d, '7:00'), '22:00');
  });

  test('text is length-limited, pattern-checked and stripped of control characters', () => {
    assert.equal(validateValue(def('focus.message'), 'a\u0000b\nc'), 'ab\nc');
    assert.equal(validateValue(def('focus.message'), 'x'.repeat(500)).length, 200);
    assert.equal(validateValue(def('location.country'), 'BH'), 'BH');
    assert.equal(validateValue(def('location.country'), 'bh1'), '');
    assert.equal(validateValue(def('wake.refHist'), 'abc<script>'), '');
  });

  test('time zones must be real IANA zones', () => {
    assert.equal(validateValue(def('location.tz'), 'Asia/Bahrain'), 'Asia/Bahrain');
    assert.equal(validateValue(def('location.tz'), 'Mars/Olympus'), '');
  });
});

describe('validateAll', () => {
  test('fills missing keys with defaults and drops unknown keys', () => {
    const v = validateAll({ 'prayer.madhab': 'hanafi', 'not.a.setting': 1 });
    assert.equal(v['prayer.madhab'], 'hanafi');
    assert.equal(v['focus.duration'], 15);
    assert.ok(!('not.a.setting' in v));
    assert.equal(Object.keys(v).length, SCHEMA.length);
  });

  test('handles garbage input', () => {
    for (const junk of [null, undefined, 42, 'str', [], [1, 2]]) {
      assert.deepEqual(validateAll(junk), defaultValues());
    }
  });
});

describe('migrate', () => {
  test('treats an unversioned flat object as version 0', () => {
    const { version, values } = migrate({ 'prayer.madhab': 'hanafi' });
    assert.equal(version, SETTINGS_VERSION);
    assert.equal(values['prayer.madhab'], 'hanafi');
  });

  test('runs each step in order', () => {
    const migrations = {
      1: (v) => ({ ...v, 'b.key': v['a.key'] * 2 }),
      2: (v) => {
        delete v['a.key'];
        return v;
      },
    };
    const out = migrate({ version: 1, values: { 'a.key': 21 } }, { migrations, target: 3 });
    assert.deepEqual(out, { version: 3, values: { 'b.key': 42 } });
  });

  test('skips a throwing step instead of losing data', () => {
    const migrations = {
      1: () => {
        throw new Error('boom');
      },
    };
    const out = migrate({ version: 1, values: { x: 1 } }, { migrations, target: 2 });
    assert.deepEqual(out.values, { x: 1 });
  });

  test('keeps data written by a newer version (validation drops unknown keys later)', () => {
    const out = migrate({ version: 99, values: { 'prayer.madhab': 'hanafi' } });
    assert.equal(out.values['prayer.madhab'], 'hanafi');
  });

  test('ignores non-object input', () => {
    assert.deepEqual(migrate('nope').values, {});
    assert.deepEqual(migrate(null).values, {});
  });
});

describe('import / export', () => {
  test('round-trips an export', () => {
    const values = { ...defaultValues(), 'prayer.method': 'Qatar', 'focus.prayers': ['fajr'] };
    const res = parseSettingsImport(JSON.stringify(buildSettingsExport(values)));
    assert.equal(res.ok, true);
    assert.equal(res.values['prayer.method'], 'Qatar');
    assert.deepEqual(res.values['focus.prayers'], ['fajr']);
    assert.deepEqual(res.ignored, []);
  });

  test('"share my setup" leaves out personal values', () => {
    const values = { ...defaultValues(), 'location.lat': 26.2, 'location.name': 'Home' };
    const shared = buildSettingsExport(values, { share: true });
    assert.equal(shared.shared, true);
    assert.ok(!('location.lat' in shared.values));
    assert.ok(!('location.name' in shared.values));
    assert.ok(!('wake.refHist' in shared.values));
    assert.ok('prayer.method' in shared.values);
  });

  test('rejects malformed JSON and foreign files', () => {
    assert.deepEqual(parseSettingsImport('{not json'), { ok: false, error: 'invalidJson' });
    assert.deepEqual(parseSettingsImport(''), { ok: false, error: 'invalidJson' });
    assert.deepEqual(parseSettingsImport('null'), { ok: false, error: 'notIman' });
    assert.deepEqual(parseSettingsImport('[]'), { ok: false, error: 'notIman' });
    assert.deepEqual(parseSettingsImport('{"app":"other"}'), { ok: false, error: 'notIman' });
    assert.deepEqual(parseSettingsImport('{"app":"iman","kind":"tracker"}'), {
      ok: false,
      error: 'wrongKind',
    });
    assert.deepEqual(parseSettingsImport('{"app":"iman","kind":"settings","values":[]}'), {
      ok: false,
      error: 'invalidShape',
    });
  });

  test('rejects oversized files', () => {
    const big = ' '.repeat(MAX_IMPORT_BYTES + 1);
    assert.deepEqual(parseSettingsImport(big), { ok: false, error: 'tooLarge' });
  });

  test('applies only valid known values and reports the rest', () => {
    const file = JSON.stringify({
      app: 'iman',
      kind: 'settings',
      version: 1,
      values: {
        'prayer.madhab': 'hanafi',
        'focus.duration': 999, // out of range -> ignored, not clamped silently
        'prayer.method': 'Atlantis',
        'unknown.key': true,
        __proto__: { polluted: true },
      },
    });
    const res = parseSettingsImport(file);
    assert.equal(res.ok, true);
    assert.deepEqual(res.values, { 'prayer.madhab': 'hanafi' });
    assert.deepEqual(res.ignored.sort(), ['focus.duration', 'prayer.method', 'unknown.key']);
    assert.equal({}.polluted, undefined);
  });

  test('a JSON "__proto__" key cannot pollute Object.prototype', () => {
    const res = parseSettingsImport(
      '{"app":"iman","kind":"settings","version":1,"values":{"__proto__":{"evil":1}}}',
    );
    assert.equal(res.ok, true);
    assert.equal({}.evil, undefined);
    assert.deepEqual(res.ignored, ['__proto__']);
  });

  test('accepts the settings part of a full backup', () => {
    const backup = {
      app: 'iman',
      kind: 'backup',
      settings: { version: 1, values: { 'tracker.weekStart': 'mon' } },
    };
    const res = parseSettingsImport(JSON.stringify(backup));
    assert.deepEqual(res.values, { 'tracker.weekStart': 'mon' });
  });
});

describe('settings store', () => {
  test('starts from defaults and survives corrupt storage', () => {
    const storage = createMemoryStorage();
    storage.setItem('iman.settings', '{corrupt');
    const s = createSettingsStore({ storage });
    assert.equal(s.get('focus.duration'), 15);
  });

  test('validates stored values on load (never trusts storage)', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'iman.settings',
      JSON.stringify({ version: 1, values: { 'focus.duration': -4, 'prayer.madhab': 'x' } }),
    );
    const s = createSettingsStore({ storage });
    assert.equal(s.get('focus.duration'), 5);
    assert.equal(s.get('prayer.madhab'), 'shafi');
  });

  test('set validates, persists and notifies only on change', () => {
    const storage = createMemoryStorage();
    const s = createSettingsStore({ storage });
    const seen = [];
    s.subscribe((keys) => seen.push(...keys));
    s.set('focus.duration', 20);
    s.set('focus.duration', 20);
    s.set('focus.offset', 400);
    assert.deepEqual(seen, ['focus.duration', 'focus.offset']);
    assert.equal(s.get('focus.offset'), 30);
    const reloaded = createSettingsStore({ storage });
    assert.equal(reloaded.get('focus.duration'), 20);
    assert.equal(JSON.parse(storage.getItem('iman.settings')).version, SETTINGS_VERSION);
  });

  test('returned arrays are copies', () => {
    const s = createSettingsStore({ storage: createMemoryStorage() });
    s.get('focus.prayers').push('bogus');
    assert.deepEqual(s.get('focus.prayers'), DEFAULTS['focus.prayers']);
  });

  test('resetSection resets one section only; resetAll keeps location', () => {
    const s = createSettingsStore({ storage: createMemoryStorage() });
    s.setMany({
      'focus.duration': 30,
      'prayer.madhab': 'hanafi',
      'location.lat': 26.2,
      'location.lon': 50.5,
    });
    s.resetSection('focus');
    assert.equal(s.get('focus.duration'), 15);
    assert.equal(s.get('prayer.madhab'), 'hanafi');
    s.resetAll();
    assert.equal(s.get('prayer.madhab'), 'shafi');
    assert.equal(s.get('location.lat'), 26.2);
  });

  test('importData applies values and reports changes', () => {
    const s = createSettingsStore({ storage: createMemoryStorage() });
    const res = s.importData(
      JSON.stringify({ app: 'iman', kind: 'settings', version: 1, values: { 'focus.offset': 5 } }),
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.changed, ['focus.offset']);
    assert.equal(s.get('focus.offset'), 5);
  });
});
