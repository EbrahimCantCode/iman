// Fixed vocabularies shared across the app. These are not user settings;
// user-tunable values live in defaults.js / schema.js.

/** The five obligatory prayers, in order. */
export const PRAYERS = Object.freeze(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);

/** Rows on the Today screen, in order (Sunrise is a time, not a prayer). */
export const DAY_TIMES = Object.freeze(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);

/** Arabic names, shown next to English names (and used by the Arabic UI). */
export const AR_NAMES = Object.freeze({
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء',
  imsak: 'الإمساك',
  duha: 'الضحى',
  tahajjud: 'التهجد',
  jumuah: 'الجمعة',
});

/** Tracker statuses, in the order the check button cycles through them. */
export const STATUSES = Object.freeze(['prayed', 'late', 'missed']);

/** Optional Sunnah prayers that can be tracked. */
export const SUNNAH = Object.freeze(['witr', 'duha', 'rawatib']);

/**
 * COCO-SSD classes a user may accept in the wake check. COCO has no
 * "bathtub" class, so the alternatives are other things found next to water.
 */
export const WAKE_OBJECTS = Object.freeze([
  'sink',
  'toilet',
  'toothbrush',
  'refrigerator',
  'oven',
  'microwave',
]);

/** Synthesised alarm tones (see js/audio.js). "custom" plays a user file. */
export const ALARM_TONES = Object.freeze(['beacon', 'pulse', 'rising', 'custom']);

export const ACCENTS = Object.freeze(['gold', 'emerald', 'sky', 'rose', 'lavender']);

/** Makkah (the Kaaba), used for the Qibla distance. Same point adhan uses. */
export const MAKKAH = Object.freeze({ lat: 21.4225241, lon: 39.8261818 });

/** localStorage keys. Bump the suffix only together with a migration. */
export const STORAGE_KEYS = Object.freeze({
  settings: 'iman.settings',
  tracker: 'iman.tracker',
  state: 'iman.state',
  travel: 'iman.travel',
});
