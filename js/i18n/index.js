// Tiny i18n: string lookup with English fallback, Arabic-aware plurals,
// numeral systems and time-zone aware Intl formatting.
//
// To add a language: copy en.js to <code>.js, translate the strings and add
// the code to LANGUAGE_CODES below. See CONTRIBUTING.md.

import en from './en.js';

/** Available languages, in menu order. */
export const LANGUAGE_CODES = ['en', 'ar'];

const loaded = new Map([['en', en]]);

let lang = en;
let numerals = 'latn';
let hour12; // undefined = locale default

/** Pick a supported language for a setting value ("auto" follows the device). */
export function resolveLanguage(setting, navLanguages = globalThis.navigator?.languages ?? []) {
  if (LANGUAGE_CODES.includes(setting)) return setting;
  for (const tag of navLanguages) {
    const base = String(tag).toLowerCase().split('-')[0];
    if (LANGUAGE_CODES.includes(base)) return base;
  }
  return 'en';
}

async function load(code) {
  if (!loaded.has(code)) {
    const mod = await import(`./${code}.js`);
    loaded.set(code, mod.default);
  }
  return loaded.get(code);
}

/**
 * Activate a language and formatting options.
 * @param {string} code language code
 * @param {{numerals?: 'auto'|'latn'|'arab', timeFormat?: 'device'|'12'|'24'}} opts
 */
export async function setLanguage(code, opts = {}) {
  lang = await load(LANGUAGE_CODES.includes(code) ? code : 'en');
  numerals = opts.numerals && opts.numerals !== 'auto' ? opts.numerals : lang.numerals || 'latn';
  hour12 = timeFormatToHour12(opts.timeFormat);
  formatterCache.clear();
  return lang;
}

/** Synchronous variant for tests and for languages already loaded. */
export function useLanguage(pack, opts = {}) {
  loaded.set(pack.code, pack);
  lang = pack;
  numerals = opts.numerals && opts.numerals !== 'auto' ? opts.numerals : pack.numerals || 'latn';
  hour12 = timeFormatToHour12(opts.timeFormat);
  formatterCache.clear();
}

function timeFormatToHour12(fmt) {
  if (fmt === '12') return true;
  if (fmt === '24') return false;
  // "Follow device": the device's own locale decides, not the app language.
  try {
    const hc = new Intl.DateTimeFormat(globalThis.navigator?.language, {
      hour: 'numeric',
    }).resolvedOptions().hourCycle;
    return hc === 'h11' || hc === 'h12';
  } catch {
    return undefined;
  }
}

export const currentLanguage = () => lang.code;
export const dir = () => lang.dir || 'ltr';
export const currentNumerals = () => numerals;
export const usesHour12 = () => hour12;

/** BCP 47 locale for Intl with the chosen numbering system. */
export function locale() {
  return `${lang.locale || lang.code}-u-nu-${numerals}`;
}

/** Whether a translation exists (in the active language or English). */
export function has(key) {
  return key in lang.strings || key in en.strings;
}

/** Translate `key`, replacing {placeholders} with `params`. */
export function t(key, params) {
  let s = lang.strings[key] ?? en.strings[key];
  if (s === undefined) return key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, name) => (name in params ? formatParam(params[name]) : m));
  }
  return s;
}

function formatParam(v) {
  return typeof v === 'number' ? fmtNum(v) : String(v);
}

/**
 * Plural-aware translation: looks up `${key}.${category}` (zero, one, two,
 * few, many, other) using the language's plural rules, then `${key}.other`.
 */
export function tn(key, count, params = {}) {
  const pick = (pack) => {
    const cat = new Intl.PluralRules(pack.locale || pack.code).select(count);
    return pack.strings[`${key}.${cat}`] ?? pack.strings[`${key}.other`];
  };
  const template = pick(lang) ?? pick(en);
  if (template === undefined) return key;
  const values = { n: count, ...params };
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    name in values ? formatParam(values[name]) : m,
  );
}

const formatterCache = new Map();
function cached(kind, opts) {
  const key = kind + JSON.stringify(opts);
  let f = formatterCache.get(key);
  if (!f) {
    f =
      kind === 'num'
        ? new Intl.NumberFormat(locale(), opts)
        : new Intl.DateTimeFormat(locale(), opts);
    formatterCache.set(key, f);
  }
  return f;
}

export function fmtNum(n, opts = {}) {
  return cached('num', opts).format(n);
}

/** Replace ASCII digits with the active numeral system (for "01:02:03" etc). */
export function digits(str) {
  if (numerals !== 'arab') return String(str);
  return String(str).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

/** Time of day, e.g. "4:18 AM" / "04:18" / "٤:١٨ ص". */
export function fmtTime(date, tz) {
  if (!date) return '—';
  return cached('dt', {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
    timeZone: tz || undefined,
  }).format(date);
}

export function fmtDate(
  date,
  tz,
  opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
) {
  return cached('dt', { ...opts, timeZone: tz || undefined }).format(date);
}

/** Hijri (Umm al-Qura) date, shifted by `offsetDays` for local moon sighting. */
export function fmtHijri(date, tz, offsetDays = 0) {
  const shifted = new Date(date.getTime() + offsetDays * 86_400_000);
  try {
    return cached('dt', {
      calendar: 'islamic-umalqura',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz || undefined,
    }).format(shifted);
  } catch {
    return '';
  }
}

/** Localised country name from an ISO code ("" if unknown). */
export function countryName(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([lang.code], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/** Human duration like "1 h 5 min" / "12 min". */
export function fmtDuration(ms) {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return t('time.hm', { h: fmtNum(h), m: fmtNum(m) });
  if (h) return t('time.h', { h: fmtNum(h) });
  return t('time.m', { m: fmtNum(m) });
}
