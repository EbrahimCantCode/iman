// Every default value in ONE place.
//
// Keys match js/config/schema.js. A test checks that every schema entry has a
// default here and that there are no stray defaults, so adding a setting means
// adding one line here and one line in the schema.

export const DEFAULTS = Object.freeze({
  // Location
  'location.mode': 'ask', // ask on first run; never silently use a default place
  'location.autoRefresh': false,
  'location.lat': null,
  'location.lon': null,
  'location.name': '',
  'location.nameAr': '',
  'location.country': '',
  'location.tz': '',

  // Prayer times
  'prayer.method': 'auto', // suggested from the location's country (methods.js)
  'prayer.customFajrAngle': 18,
  'prayer.customIshaMode': 'angle',
  'prayer.customIshaAngle': 17,
  'prayer.customIshaMinutes': 90,
  'prayer.madhab': 'shafi',
  'prayer.highLatRule': 'auto',
  'prayer.adjust.fajr': 0,
  'prayer.adjust.sunrise': 0,
  'prayer.adjust.dhuhr': 0,
  'prayer.adjust.asr': 0,
  'prayer.adjust.maghrib': 0,
  'prayer.adjust.isha': 0,
  'prayer.showSunrise': true,
  'prayer.showImsak': false,
  'prayer.imsakMinutes': 10,
  'prayer.showDuha': false,
  'prayer.duhaMinutes': 15,
  'prayer.showTahajjud': false,
  'prayer.timeFormat': 'device',
  'prayer.hijriOffset': 0,

  // Reminders and adhan
  'reminders.enabled': false, // permission is only requested when switched on
  'reminders.fajr.atTime': true,
  'reminders.fajr.before': 0,
  'reminders.fajr.windowEnd': 0,
  'reminders.fajr.sound': 'adhan',
  'reminders.dhuhr.atTime': true,
  'reminders.dhuhr.before': 0,
  'reminders.dhuhr.windowEnd': 0,
  'reminders.dhuhr.sound': 'adhan',
  'reminders.asr.atTime': true,
  'reminders.asr.before': 0,
  'reminders.asr.windowEnd': 0,
  'reminders.asr.sound': 'adhan',
  'reminders.maghrib.atTime': true,
  'reminders.maghrib.before': 0,
  'reminders.maghrib.windowEnd': 0,
  'reminders.maghrib.sound': 'adhan',
  'reminders.isha.atTime': true,
  'reminders.isha.before': 0,
  'reminders.isha.windowEnd': 0,
  'reminders.isha.sound': 'adhan',
  'reminders.ishaEnd': 'midnight',
  'reminders.sunriseWarning': 15,
  'reminders.jumuah': true,
  'reminders.jumuahMinutes': 45,
  'reminders.volume': 80,
  'reminders.vibrate': true,
  'reminders.quietHours': false,
  'reminders.quietStart': '22:00',
  'reminders.quietEnd': '06:00',

  // Prayer focus lock
  'focus.enabled': true,
  'focus.prayers': ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
  'focus.offset': 0,
  'focus.duration': 15,
  'focus.exitHold': 3,
  'focus.message': '', // empty = the translated default message
  'focus.autoMark': true,

  // Wake check (Fajr)
  'wake.enabled': false,
  'wake.threshold': 0.6,
  'wake.attempts': 5,
  'wake.mathCount': 3,
  'wake.mathDifficulty': 'medium',
  'wake.tone': 'beacon',
  'wake.ramp': 30,
  'wake.maxVolume': 100,
  'wake.refPhoto': false,
  'wake.refThreshold': 0.7,
  'wake.refHist': '',
  'wake.objects': ['sink'],

  // Tracker
  'tracker.statuses': ['prayed', 'late', 'missed'],
  'tracker.streakRule': 'prayedOrLate',
  'tracker.sunnah': false,
  'tracker.weekStart': 'sat',
  'tracker.fillReminder': false,
  'tracker.fillReminderMinutes': 60,

  // Appearance and language
  'appearance.language': 'auto',
  'appearance.theme': 'system',
  'appearance.accent': 'gold',
  'appearance.numerals': 'auto',
  'appearance.fontSize': 'normal',
  'appearance.startScreen': 'today',

  // Advanced
  'advanced.devMode': false,
});
