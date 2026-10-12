// Calculation methods and the per-country suggestion table.
//
// The suggestion is only a starting point: the UI always labels it
// "Suggested for your location" and lets the user pick another method.
// To improve a suggestion, edit COUNTRY_METHODS (ISO 3166-1 alpha-2 codes)
// and cite the official source in your pull request.

/** Method ids, matching adhan.CalculationMethod factory names. */
export const METHODS = Object.freeze([
  'MuslimWorldLeague',
  'UmmAlQura',
  'Kuwait',
  'Qatar',
  'Dubai',
  'Egyptian',
  'Karachi',
  'NorthAmerica',
  'MoonsightingCommittee',
  'Turkey',
  'Singapore',
  'Tehran',
]);

export const AUTO_METHOD = 'auto';
export const CUSTOM_METHOD = 'Custom';
export const FALLBACK_METHOD = 'MuslimWorldLeague';

export const COUNTRY_METHODS = Object.freeze({
  // Gulf
  SA: 'UmmAlQura',
  AE: 'Dubai',
  QA: 'Qatar',
  KW: 'Kuwait',
  // Bahrain: Kuwait parameters (Fajr 18°, Isha 17.5°) match the project's
  // reference timetable for Manama (see tests/prayer.test.js).
  BH: 'Kuwait',
  OM: 'MuslimWorldLeague',
  YE: 'UmmAlQura',

  // Egypt and neighbours commonly following the Egyptian General Authority
  EG: 'Egyptian',
  SD: 'Egyptian',
  LY: 'Egyptian',
  SY: 'Egyptian',
  LB: 'Egyptian',

  // South Asia: University of Islamic Sciences, Karachi
  PK: 'Karachi',
  IN: 'Karachi',
  BD: 'Karachi',
  AF: 'Karachi',

  // South-East Asia (JAKIM / MUIS / Kemenag use Fajr 20°, Isha 18°)
  SG: 'Singapore',
  MY: 'Singapore',
  ID: 'Singapore',
  BN: 'Singapore',

  // North America
  US: 'NorthAmerica',
  CA: 'NorthAmerica',

  // United Kingdom: many mosques follow the Moonsighting Committee
  GB: 'MoonsightingCommittee',

  TR: 'Turkey',
  IR: 'Tehran',
});

/** Suggested method for an ISO country code (falls back to MWL). */
export function suggestMethod(countryCode) {
  const code = typeof countryCode === 'string' ? countryCode.toUpperCase() : '';
  return COUNTRY_METHODS[code] ?? FALLBACK_METHOD;
}

/** Resolve the "prayer.method" setting to a concrete method id or "Custom". */
export function resolveMethod(setting, countryCode) {
  if (setting === CUSTOM_METHOD || METHODS.includes(setting)) return setting;
  return suggestMethod(countryCode);
}
