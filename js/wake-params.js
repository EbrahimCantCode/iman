// URL parameters for wake.html. On iPhone, a URL opened from a Shortcuts
// automation launches in Safari, which does NOT share storage with the
// Home Screen app, so the wake check link carries the user's settings.
//
//   wake.html?threshold=0.6&attempts=5&math=3&difficulty=medium
//            &objects=sink,toilet&tone=beacon&ramp=30&volume=100
//            &ref=<histogram>&refThreshold=0.7&lang=ar
//
// Every value is validated against the settings schema, exactly like stored
// settings. Precedence: defaults < settings stored in this browser < URL.

import { SCHEMA_BY_KEY } from './config/schema.js';
import { validateValue } from './settings.js';

/** URL parameter name -> settings key. */
export const WAKE_PARAMS = Object.freeze({
  threshold: 'wake.threshold',
  attempts: 'wake.attempts',
  math: 'wake.mathCount',
  difficulty: 'wake.mathDifficulty',
  objects: 'wake.objects',
  tone: 'wake.tone',
  ramp: 'wake.ramp',
  volume: 'wake.maxVolume',
  ref: 'wake.refHist',
  refThreshold: 'wake.refThreshold',
  lang: 'appearance.language',
  dev: 'advanced.devMode',
});

const MAX_PARAM_LENGTH = 300;
const INVALID = Symbol('invalid');

/**
 * Wake settings from a query string, layered over `stored` values.
 * Unknown or invalid parameters are ignored (the stored/default value stays).
 * @returns {{values: object, fromUrl: string[]}}
 */
export function parseWakeParams(search, stored) {
  const params = new URLSearchParams(search);
  const values = { ...stored };
  const fromUrl = [];
  for (const [param, key] of Object.entries(WAKE_PARAMS)) {
    if (!params.has(param)) continue;
    const raw = params.get(param);
    if (raw.length > MAX_PARAM_LENGTH) continue;
    // Validate with a sentinel default so invalid input is ignored instead of
    // silently becoming the default (numbers are still clamped to their range).
    const v = validateValue({ ...SCHEMA_BY_KEY.get(key), default: INVALID }, raw);
    if (v === INVALID) continue;
    values[key] = v;
    fromUrl.push(key);
  }
  // A reference histogram in the link means the anti-cheat check is on.
  if (fromUrl.includes('wake.refHist') && values['wake.refHist']) values['wake.refPhoto'] = true;
  return { values, fromUrl };
}

/**
 * Build the user's wake check link from their settings. `lang` is the
 * language in use (so "Follow device" still opens in the same language).
 */
export function buildWakeLink(base, values, lang = null) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  const set = (param, value) => url.searchParams.set(param, String(value));
  set('threshold', values['wake.threshold']);
  set('attempts', values['wake.attempts']);
  set('math', values['wake.mathCount']);
  set('difficulty', values['wake.mathDifficulty']);
  set('objects', values['wake.objects'].join(','));
  set('tone', values['wake.tone']);
  set('ramp', values['wake.ramp']);
  set('volume', values['wake.maxVolume']);
  if (values['wake.refPhoto'] && values['wake.refHist']) {
    set('ref', values['wake.refHist']);
    set('refThreshold', values['wake.refThreshold']);
  }
  const language = values['appearance.language'] !== 'auto' ? values['appearance.language'] : lang;
  if (language) set('lang', language);
  return url.toString();
}
