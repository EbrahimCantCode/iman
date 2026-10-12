// Settings store: load, validate/clamp, migrate, save, import and export.
// Everything is driven by js/config/schema.js. Stored data is never trusted:
// each value is validated against the schema on load and on import.

import { SCHEMA, SCHEMA_BY_KEY, SETTINGS_VERSION } from './config/schema.js';
import { STORAGE_KEYS } from './config/constants.js';
import { readJSON, writeJSON, isPlainObject } from './storage.js';

/**
 * Migrations, keyed by the version they upgrade FROM. Each receives a copy of
 * the stored values and returns the upgraded values. Example for a rename:
 *
 *   1: (v) => { v['new.key'] = v['old.key']; delete v['old.key']; return v; },
 *
 * Version 0 is an unversioned flat object (stored before versioning existed).
 */
export const MIGRATIONS = Object.freeze({
  0: (v) => v,
});

export const MAX_IMPORT_BYTES = 1_000_000;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const clone = (v) => (Array.isArray(v) ? [...v] : v);

function equal(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}

function decimals(step) {
  const s = String(step);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function stripControlChars(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) out += ch;
  }
  return out;
}

/**
 * Validate one value against its schema entry. Invalid values become the
 * default; numbers are clamped to [min, max] and snapped to the step.
 * Strings from URL parameters ("true", "0.6", "a,b") are accepted too.
 */
export function validateValue(def, raw) {
  const fallback = clone(def.default);
  switch (def.type) {
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === '1' || raw === 1) return true;
      if (raw === 'false' || raw === '0' || raw === 0) return false;
      return fallback;

    case 'number': {
      if (raw === null) return def.nullable ? null : fallback;
      let n = NaN;
      if (typeof raw === 'number') n = raw;
      else if (typeof raw === 'string' && raw.trim() !== '') n = Number(raw);
      if (!Number.isFinite(n)) return fallback;
      let v = Math.min(def.max, Math.max(def.min, n));
      if (def.step) {
        v = def.min + Math.round((v - def.min) / def.step) * def.step;
        v = Number(Math.min(def.max, v).toFixed(decimals(def.step)));
      }
      return Object.is(v, -0) ? 0 : v;
    }

    case 'select':
      return def.options.includes(raw) ? raw : fallback;

    case 'multiselect': {
      let list = raw;
      if (typeof list === 'string') list = list === '' ? [] : list.split(',');
      if (!Array.isArray(list)) return fallback;
      const chosen = new Set(list);
      const v = def.options.filter((o) => chosen.has(o));
      return v.length >= (def.minItems ?? 0) ? v : fallback;
    }

    case 'time':
      return typeof raw === 'string' && TIME_RE.test(raw) ? raw : fallback;

    case 'text': {
      if (typeof raw !== 'string') return fallback;
      const v = stripControlChars(raw).slice(0, def.maxLength ?? 500);
      if (def.pattern && !def.pattern.test(v)) return fallback;
      if (def.validate && !def.validate(v)) return fallback;
      return v;
    }

    default:
      return fallback;
  }
}

/** A fresh object holding every setting at its default. */
export function defaultValues() {
  const out = {};
  for (const def of SCHEMA) out[def.key] = clone(def.default);
  return out;
}

/** Validate a whole values object: unknown keys are dropped, missing keys defaulted. */
export function validateAll(input) {
  const src = isPlainObject(input) ? input : {};
  const out = {};
  for (const def of SCHEMA) {
    out[def.key] = Object.hasOwn(src, def.key)
      ? validateValue(def, src[def.key])
      : clone(def.default);
  }
  return out;
}

/**
 * Bring stored data up to `target` version. Never throws: a broken migration
 * step is skipped and validation afterwards repairs whatever it left behind.
 */
export function migrate(stored, { migrations = MIGRATIONS, target = SETTINGS_VERSION } = {}) {
  if (!isPlainObject(stored)) return { version: target, values: {} };
  let version = Number.isInteger(stored.version) && stored.version >= 0 ? stored.version : 0;
  let values;
  if (isPlainObject(stored.values)) values = { ...stored.values };
  else if (version === 0) values = { ...stored };
  else values = {};

  while (version < target) {
    const step = migrations[version];
    if (typeof step === 'function') {
      try {
        const next = step({ ...values });
        if (isPlainObject(next)) values = next;
      } catch {
        /* skip a failing step */
      }
    }
    version += 1;
  }
  return { version: target, values };
}

/** Build a JSON-serialisable settings export. `share` drops personal values. */
export function buildSettingsExport(values, { share = false, now = new Date() } = {}) {
  const out = {};
  for (const def of SCHEMA) {
    if (share && def.personal) continue;
    out[def.key] = clone(values[def.key]);
  }
  const data = {
    app: 'iman',
    kind: 'settings',
    version: SETTINGS_VERSION,
    exportedAt: now.toISOString(),
    values: out,
  };
  if (share) data.shared = true;
  return data;
}

/**
 * Parse and validate an imported settings (or full backup) file.
 * Only known keys whose values already pass validation are applied; everything
 * else is reported in `ignored` and the current value is kept.
 * @returns {{ok: true, values: object, ignored: string[]} | {ok: false, error: string}}
 */
export function parseSettingsImport(input) {
  let data = input;
  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_BYTES) return { ok: false, error: 'tooLarge' };
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: 'invalidJson' };
    }
  }
  if (!isPlainObject(data) || data.app !== 'iman') return { ok: false, error: 'notIman' };

  let payload;
  if (data.kind === 'settings') payload = data;
  else if (data.kind === 'backup') payload = data.settings;
  else return { ok: false, error: 'wrongKind' };
  if (!isPlainObject(payload) || !isPlainObject(payload.values)) {
    return { ok: false, error: 'invalidShape' };
  }

  const version = Number.isInteger(payload.version) ? payload.version : 0;
  const { values: migrated } = migrate({ version, values: payload.values });
  const values = {};
  const ignored = [];
  for (const [key, raw] of Object.entries(migrated)) {
    const def = SCHEMA_BY_KEY.get(key);
    if (!def) {
      ignored.push(key);
      continue;
    }
    const v = validateValue(def, raw);
    if (equal(v, raw)) values[key] = v;
    else ignored.push(key);
  }
  return { ok: true, values, ignored };
}

/**
 * Create the settings store.
 * @param {{storage: Storage, key?: string}} opts
 */
export function createSettingsStore({ storage, key = STORAGE_KEYS.settings }) {
  const stored = readJSON(storage, key, null);
  let values = validateAll(migrate(stored).values);
  const listeners = new Set();

  const persist = () => writeJSON(storage, key, { version: SETTINGS_VERSION, values });
  if (stored && stored.version !== SETTINGS_VERSION) persist();

  function emit(keys) {
    if (keys.length === 0) return;
    for (const fn of listeners) {
      try {
        fn(keys, values);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function apply(patch) {
    const changed = [];
    const next = { ...values };
    for (const [k, raw] of Object.entries(patch)) {
      const def = SCHEMA_BY_KEY.get(k);
      if (!def) continue;
      const v = validateValue(def, raw);
      if (!equal(v, next[k])) {
        next[k] = v;
        changed.push(k);
      }
    }
    if (changed.length) {
      values = next;
      persist();
      emit(changed);
    }
    return changed;
  }

  return {
    get: (k) => clone(values[k]),
    /** A snapshot of all values (safe to keep; arrays are copied). */
    all: () => {
      const out = {};
      for (const [k, v] of Object.entries(values)) out[k] = clone(v);
      return out;
    },
    set: (k, v) => apply({ [k]: v }),
    setMany: (patch) => apply(patch),
    resetSection(section) {
      const patch = {};
      for (const def of SCHEMA) {
        if (def.section === section && !def.hidden) patch[def.key] = clone(def.default);
      }
      return apply(patch);
    },
    /** Reset every visible setting. Location and the reference photo are kept. */
    resetAll() {
      const patch = {};
      for (const def of SCHEMA) if (!def.hidden) patch[def.key] = clone(def.default);
      return apply(patch);
    },
    exportData: (opts) => buildSettingsExport(values, opts),
    importData(input) {
      const result = parseSettingsImport(input);
      if (!result.ok) return result;
      const changed = apply(result.values);
      return { ...result, changed };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Whether anything has been saved yet (used to detect first run). */
    hasStoredData: () => stored != null,
  };
}
