// The settings schema drives validation, migration, import/export and the
// Settings screen. Adding a setting = one line here + its default in
// defaults.js + its label in js/i18n/*.js. See CONTRIBUTING.md.
//
// Entry fields:
//   key        dotted id, e.g. "prayer.madhab"
//   type       "number" | "boolean" | "select" | "multiselect" | "time" | "text"
//   section    one of SECTIONS (where it appears in Settings)
//   group      optional sub-heading inside the section (i18n "group.<group>")
//   min/max/step   numbers are clamped and snapped to step
//   options    allowed values for select / multiselect
//   optionsKey i18n prefix for option labels ("opt.<optionsKey>.<value>")
//   nullable   number may be null (e.g. no location yet)
//   hidden     stored and validated, but not rendered as a plain control
//   personal   left out of "share my setup" exports
//   showIf     (values) => boolean, hides the control when false
//   label/help i18n keys; default "set.<key>" and "set.<key>.help"
//
// The default value of every entry comes from DEFAULTS.

import { DEFAULTS } from './defaults.js';
import { PRAYERS, STATUSES, WAKE_OBJECTS, ALARM_TONES, ACCENTS } from './constants.js';
import { METHODS, AUTO_METHOD, CUSTOM_METHOD } from './methods.js';

export const SETTINGS_VERSION = 1;

export const SECTIONS = Object.freeze([
  'location',
  'prayer',
  'reminders',
  'focus',
  'wake',
  'tracker',
  'appearance',
  'data',
  'advanced',
]);

const isTimeZone = (tz) => {
  if (tz === '') return true;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const custom = (v) => v['prayer.method'] === CUSTOM_METHOD;

const perPrayerReminders = PRAYERS.flatMap((p) => [
  {
    key: `reminders.${p}.atTime`,
    type: 'boolean',
    section: 'reminders',
    group: p,
    label: 'set.reminders.atTime',
  },
  {
    key: `reminders.${p}.before`,
    type: 'number',
    section: 'reminders',
    group: p,
    min: 0,
    max: 60,
    step: 5,
    unit: 'min',
    label: 'set.reminders.before',
    help: 'set.reminders.before.help',
  },
  {
    key: `reminders.${p}.windowEnd`,
    type: 'number',
    section: 'reminders',
    group: p,
    min: 0,
    max: 60,
    step: 5,
    unit: 'min',
    label: 'set.reminders.windowEnd',
    help: 'set.reminders.windowEnd.help',
  },
  {
    key: `reminders.${p}.sound`,
    type: 'select',
    section: 'reminders',
    group: p,
    options: ['adhan', 'chime', 'silent'],
    optionsKey: 'sound',
    label: p === 'fajr' ? 'set.reminders.fajrSound' : 'set.reminders.sound',
    help: p === 'fajr' ? 'set.reminders.fajrSound.help' : null,
  },
]);

const adjustments = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map((p) => ({
  key: `prayer.adjust.${p}`,
  type: 'number',
  section: 'prayer',
  group: 'adjustments',
  min: -30,
  max: 30,
  step: 1,
  unit: 'min',
  label: `prayer.${p}`,
  help: null,
}));

const ENTRIES = [
  // Location (rendered by a custom widget; values are kept here for validation)
  {
    key: 'location.mode',
    type: 'select',
    section: 'location',
    options: ['ask', 'gps', 'city', 'manual'],
    hidden: true,
  },
  { key: 'location.autoRefresh', type: 'boolean', section: 'location' },
  {
    key: 'location.lat',
    type: 'number',
    section: 'location',
    min: -90,
    max: 90,
    step: 0.0001,
    nullable: true,
    hidden: true,
    personal: true,
  },
  {
    key: 'location.lon',
    type: 'number',
    section: 'location',
    min: -180,
    max: 180,
    step: 0.0001,
    nullable: true,
    hidden: true,
    personal: true,
  },
  {
    key: 'location.name',
    type: 'text',
    section: 'location',
    maxLength: 120,
    hidden: true,
    personal: true,
  },
  {
    key: 'location.nameAr',
    type: 'text',
    section: 'location',
    maxLength: 120,
    hidden: true,
    personal: true,
  },
  {
    key: 'location.country',
    type: 'text',
    section: 'location',
    maxLength: 2,
    pattern: /^([A-Z]{2})?$/,
    hidden: true,
    personal: true,
  },
  {
    key: 'location.tz',
    type: 'text',
    section: 'location',
    maxLength: 64,
    validate: isTimeZone,
    hidden: true,
    personal: true,
  },

  // Prayer times
  {
    key: 'prayer.method',
    type: 'select',
    section: 'prayer',
    options: [AUTO_METHOD, ...METHODS, CUSTOM_METHOD],
    optionsKey: 'method',
  },
  {
    key: 'prayer.customFajrAngle',
    type: 'number',
    section: 'prayer',
    min: 10,
    max: 22,
    step: 0.1,
    unit: 'deg',
    showIf: custom,
  },
  {
    key: 'prayer.customIshaMode',
    type: 'select',
    section: 'prayer',
    options: ['angle', 'minutes'],
    showIf: custom,
  },
  {
    key: 'prayer.customIshaAngle',
    type: 'number',
    section: 'prayer',
    min: 10,
    max: 22,
    step: 0.1,
    unit: 'deg',
    showIf: (v) => custom(v) && v['prayer.customIshaMode'] === 'angle',
  },
  {
    key: 'prayer.customIshaMinutes',
    type: 'number',
    section: 'prayer',
    min: 30,
    max: 180,
    step: 1,
    unit: 'min',
    showIf: (v) => custom(v) && v['prayer.customIshaMode'] === 'minutes',
  },
  { key: 'prayer.madhab', type: 'select', section: 'prayer', options: ['shafi', 'hanafi'] },
  {
    key: 'prayer.highLatRule',
    type: 'select',
    section: 'prayer',
    options: ['auto', 'middle', 'seventh', 'twilight'],
  },
  ...adjustments,
  { key: 'prayer.showSunrise', type: 'boolean', section: 'prayer', group: 'extraTimes' },
  { key: 'prayer.showImsak', type: 'boolean', section: 'prayer', group: 'extraTimes' },
  {
    key: 'prayer.imsakMinutes',
    type: 'number',
    section: 'prayer',
    group: 'extraTimes',
    min: 1,
    max: 30,
    step: 1,
    unit: 'min',
    showIf: (v) => v['prayer.showImsak'],
  },
  { key: 'prayer.showDuha', type: 'boolean', section: 'prayer', group: 'extraTimes' },
  {
    key: 'prayer.duhaMinutes',
    type: 'number',
    section: 'prayer',
    group: 'extraTimes',
    min: 10,
    max: 45,
    step: 1,
    unit: 'min',
    showIf: (v) => v['prayer.showDuha'],
  },
  { key: 'prayer.showTahajjud', type: 'boolean', section: 'prayer', group: 'extraTimes' },
  {
    key: 'prayer.timeFormat',
    type: 'select',
    section: 'prayer',
    options: ['device', '12', '24'],
  },
  {
    key: 'prayer.hijriOffset',
    type: 'number',
    section: 'prayer',
    min: -2,
    max: 2,
    step: 1,
    unit: 'days',
  },

  // Reminders and adhan
  { key: 'reminders.enabled', type: 'boolean', section: 'reminders' },
  ...perPrayerReminders,
  {
    key: 'reminders.ishaEnd',
    type: 'select',
    section: 'reminders',
    group: 'isha',
    options: ['midnight', 'fajr'],
  },
  {
    key: 'reminders.sunriseWarning',
    type: 'number',
    section: 'reminders',
    group: 'other',
    min: 0,
    max: 60,
    step: 5,
    unit: 'min',
  },
  { key: 'reminders.jumuah', type: 'boolean', section: 'reminders', group: 'other' },
  {
    key: 'reminders.jumuahMinutes',
    type: 'number',
    section: 'reminders',
    group: 'other',
    min: 5,
    max: 180,
    step: 5,
    unit: 'min',
    showIf: (v) => v['reminders.jumuah'],
  },
  {
    key: 'reminders.volume',
    type: 'number',
    section: 'reminders',
    group: 'sound',
    min: 0,
    max: 100,
    step: 5,
    unit: 'percent',
  },
  { key: 'reminders.vibrate', type: 'boolean', section: 'reminders', group: 'sound' },
  { key: 'reminders.quietHours', type: 'boolean', section: 'reminders', group: 'sound' },
  {
    key: 'reminders.quietStart',
    type: 'time',
    section: 'reminders',
    group: 'sound',
    showIf: (v) => v['reminders.quietHours'],
  },
  {
    key: 'reminders.quietEnd',
    type: 'time',
    section: 'reminders',
    group: 'sound',
    showIf: (v) => v['reminders.quietHours'],
  },

  // Prayer focus lock
  { key: 'focus.enabled', type: 'boolean', section: 'focus' },
  {
    key: 'focus.prayers',
    type: 'multiselect',
    section: 'focus',
    options: [...PRAYERS],
    optionsKey: 'prayer',
  },
  { key: 'focus.offset', type: 'number', section: 'focus', min: 0, max: 30, step: 1, unit: 'min' },
  {
    key: 'focus.duration',
    type: 'number',
    section: 'focus',
    min: 5,
    max: 60,
    step: 1,
    unit: 'min',
  },
  { key: 'focus.exitHold', type: 'number', section: 'focus', min: 2, max: 10, step: 1, unit: 's' },
  { key: 'focus.message', type: 'text', section: 'focus', maxLength: 200, multiline: true },
  { key: 'focus.autoMark', type: 'boolean', section: 'focus' },

  // Wake check
  { key: 'wake.enabled', type: 'boolean', section: 'wake' },
  {
    key: 'wake.objects',
    type: 'multiselect',
    section: 'wake',
    options: [...WAKE_OBJECTS],
    optionsKey: 'object',
    minItems: 1,
  },
  {
    key: 'wake.threshold',
    type: 'number',
    section: 'wake',
    group: 'detection',
    min: 0.3,
    max: 0.95,
    step: 0.05,
  },
  {
    key: 'wake.attempts',
    type: 'number',
    section: 'wake',
    group: 'detection',
    min: 3,
    max: 15,
    step: 1,
  },
  {
    key: 'wake.mathCount',
    type: 'number',
    section: 'wake',
    group: 'fallback',
    min: 1,
    max: 10,
    step: 1,
  },
  {
    key: 'wake.mathDifficulty',
    type: 'select',
    section: 'wake',
    group: 'fallback',
    options: ['easy', 'medium', 'hard'],
  },
  {
    key: 'wake.tone',
    type: 'select',
    section: 'wake',
    group: 'alarm',
    options: [...ALARM_TONES],
    optionsKey: 'tone',
  },
  {
    key: 'wake.ramp',
    type: 'number',
    section: 'wake',
    group: 'alarm',
    min: 0,
    max: 120,
    step: 5,
    unit: 's',
  },
  {
    key: 'wake.maxVolume',
    type: 'number',
    section: 'wake',
    group: 'alarm',
    min: 10,
    max: 100,
    step: 5,
    unit: 'percent',
  },
  { key: 'wake.refPhoto', type: 'boolean', section: 'wake', group: 'antiCheat' },
  {
    key: 'wake.refThreshold',
    type: 'number',
    section: 'wake',
    group: 'antiCheat',
    min: 0.3,
    max: 0.99,
    step: 0.01,
    showIf: (v) => v['wake.refPhoto'],
  },
  {
    key: 'wake.refHist',
    type: 'text',
    section: 'wake',
    maxLength: 256,
    pattern: /^[A-Za-z0-9_-]*$/,
    hidden: true,
    personal: true,
  },

  // Tracker
  {
    key: 'tracker.statuses',
    type: 'multiselect',
    section: 'tracker',
    options: [...STATUSES],
    optionsKey: 'status',
    minItems: 1,
  },
  {
    key: 'tracker.streakRule',
    type: 'select',
    section: 'tracker',
    options: ['onTime', 'prayedOrLate'],
  },
  { key: 'tracker.sunnah', type: 'boolean', section: 'tracker' },
  { key: 'tracker.weekStart', type: 'select', section: 'tracker', options: ['sat', 'sun', 'mon'] },
  { key: 'tracker.fillReminder', type: 'boolean', section: 'tracker' },
  {
    key: 'tracker.fillReminderMinutes',
    type: 'number',
    section: 'tracker',
    min: 15,
    max: 240,
    step: 15,
    unit: 'min',
    showIf: (v) => v['tracker.fillReminder'],
  },

  // Appearance and language
  {
    key: 'appearance.language',
    type: 'select',
    section: 'appearance',
    options: ['auto', 'en', 'ar'],
  },
  {
    key: 'appearance.theme',
    type: 'select',
    section: 'appearance',
    options: ['system', 'dark', 'light'],
  },
  {
    key: 'appearance.accent',
    type: 'select',
    section: 'appearance',
    options: [...ACCENTS],
    optionsKey: 'accent',
  },
  {
    key: 'appearance.numerals',
    type: 'select',
    section: 'appearance',
    options: ['auto', 'latn', 'arab'],
  },
  {
    key: 'appearance.fontSize',
    type: 'select',
    section: 'appearance',
    options: ['small', 'normal', 'large'],
  },
  {
    key: 'appearance.startScreen',
    type: 'select',
    section: 'appearance',
    options: ['today', 'qibla', 'tracker'],
    optionsKey: 'tab',
  },

  // Advanced
  { key: 'advanced.devMode', type: 'boolean', section: 'advanced' },
];

export const SCHEMA = Object.freeze(
  ENTRIES.map((e) =>
    Object.freeze({
      label: `set.${e.key}`,
      help: `set.${e.key}.help`,
      optionsKey: e.key,
      ...e,
      default: DEFAULTS[e.key],
    }),
  ),
);

export const SCHEMA_BY_KEY = new Map(SCHEMA.map((e) => [e.key, e]));
