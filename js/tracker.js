// Prayer tracker: one record per calendar day, streaks and completion stats.
//
// Stored as { version: 2, days: { "2026-10-12": { fajr: "prayed", dhuhr: "late",
//   sunnah: { witr: true }, wake: "04:41", travel: true,
//   meta: { dhuhr: { shortened: true, combinedWith: "asr", combineType: "early" } } } } }
// Unmarked prayers are absent. Statuses stay plain strings; the optional
// travel flags live in "meta", so records without them are normal prayers.

import { PRAYERS, STATUSES, SUNNAH, STORAGE_KEYS } from './config/constants.js';
import { COMBINE_PAIRS } from './config/travel-rules.js';
import { readJSON, writeJSON, isPlainObject } from './storage.js';
import { addDays, isYmd, daysBetween } from './time.js';

export const TRACKER_VERSION = 2;

/**
 * Tracker migrations, keyed by the version they upgrade FROM.
 * 1 -> 2 added the optional "meta" and "travel" fields. Version 1 records
 * are already valid version 2 records (missing flags = a normal prayer).
 */
export const TRACKER_MIGRATIONS = Object.freeze({
  1: (days) => days,
});

/** Bring a stored tracker payload up to the current version. */
export function migrateTracker(stored) {
  if (!isPlainObject(stored)) return {};
  let version = Number.isInteger(stored.version) ? stored.version : 1;
  let days = isPlainObject(stored.days) ? stored.days : {};
  while (version < TRACKER_VERSION) {
    days = TRACKER_MIGRATIONS[version]?.(days) ?? days;
    version += 1;
  }
  return days;
}

const PARTNER = Object.fromEntries(
  COMBINE_PAIRS.flatMap(([a, b]) => [
    [a, b],
    [b, a],
  ]),
);

/** Clean the travel flags of one prayer; null when there are none. */
export function validateMeta(prayer, raw) {
  if (!isPlainObject(raw)) return null;
  const meta = {};
  if (raw.shortened === true && ['dhuhr', 'asr', 'isha'].includes(prayer)) meta.shortened = true;
  if (raw.combinedWith && raw.combinedWith === PARTNER[prayer]) {
    meta.combinedWith = raw.combinedWith;
    if (['early', 'delayed'].includes(raw.combineType)) meta.combineType = raw.combineType;
  }
  return Object.keys(meta).length ? meta : null;
}
export const MAX_TRACKER_IMPORT_BYTES = 5_000_000;
const WAKE_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Clean one day record; returns null when nothing valid is left. */
export function validateDay(raw) {
  if (!isPlainObject(raw)) return null;
  const day = {};
  for (const p of PRAYERS) if (STATUSES.includes(raw[p])) day[p] = raw[p];
  if (isPlainObject(raw.sunnah)) {
    const sunnah = {};
    for (const s of SUNNAH) if (raw.sunnah[s] === true) sunnah[s] = true;
    if (Object.keys(sunnah).length) day.sunnah = sunnah;
  }
  if (typeof raw.wake === 'string' && WAKE_RE.test(raw.wake)) day.wake = raw.wake;
  if (raw.travel === true) day.travel = true;
  if (isPlainObject(raw.meta)) {
    const meta = {};
    for (const p of PRAYERS) {
      const m = day[p] ? validateMeta(p, raw.meta[p]) : null;
      if (m) meta[p] = m;
    }
    if (Object.keys(meta).length) day.meta = meta;
  }
  return Object.keys(day).length ? day : null;
}

/** Validate a days map. Returns { days, ignored } where ignored counts dropped entries. */
export function validateDays(raw) {
  const days = {};
  let ignored = 0;
  if (!isPlainObject(raw)) return { days, ignored };
  for (const [date, value] of Object.entries(raw)) {
    const day = isYmd(date) ? validateDay(value) : null;
    if (day) days[date] = day;
    else ignored += 1;
  }
  return { days, ignored };
}

/** Next status when the check button is tapped: none -> enabled statuses... -> none. */
export function nextStatus(current, enabled = STATUSES) {
  const cycle = [null, ...STATUSES.filter((s) => enabled.includes(s))];
  const i = cycle.indexOf(current ?? null);
  // A status that was switched off in settings restarts the cycle.
  if (i < 0) return cycle[1] ?? null;
  return cycle[(i + 1) % cycle.length];
}

/** Whether a day counts towards the streak under `rule` ("onTime" | "prayedOrLate"). */
export function isDayComplete(day, rule = 'prayedOrLate') {
  if (!day) return false;
  const ok = rule === 'onTime' ? ['prayed'] : ['prayed', 'late'];
  return PRAYERS.every((p) => ok.includes(day[p]));
}

/**
 * Current and best streak. Today still being in progress doesn't break the
 * current streak: it counts up to yesterday until today is complete.
 */
export function computeStreaks(days, today, rule = 'prayedOrLate') {
  let current = 0;
  let cursor = isDayComplete(days[today], rule) ? today : addDays(today, -1);
  while (isDayComplete(days[cursor], rule)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  let prev = null;
  const dates = Object.keys(days)
    .filter((d) => d <= today)
    .sort();
  for (const d of dates) {
    if (!isDayComplete(days[d], rule)) {
      run = 0;
      prev = d;
      continue;
    }
    run = prev && daysBetween(prev, d) === 1 && run > 0 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

/**
 * Share of prayers prayed (on time or late) over the given dates.
 * Prayers in the future (per `isDue`) are left out of the total.
 */
export function completion(days, dates, isDue = () => true) {
  let done = 0;
  let total = 0;
  for (const d of dates) {
    for (const p of PRAYERS) {
      if (!isDue(d, p)) continue;
      total += 1;
      if (days[d]?.[p] === 'prayed' || days[d]?.[p] === 'late') done += 1;
    }
  }
  return { done, total, ratio: total ? done / total : 0 };
}

/** Number of travel days among `dates`. */
export function countTravelDays(days, dates) {
  return dates.filter((d) => days[d]?.travel).length;
}

/** The last `n` dates ending at `today`, oldest first. */
export function lastDates(today, n) {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

/** Start of the week containing `date` (weekStart: "sat" | "sun" | "mon"). */
export function weekStartDate(date, weekStart, weekdayOf) {
  const target = { sun: 0, mon: 1, sat: 6 }[weekStart] ?? 6;
  const diff = (weekdayOf(date) - target + 7) % 7;
  return addDays(date, -diff);
}

/**
 * Parse an imported tracker (or backup) file.
 * @returns {{ok: true, days: object, ignored: number} | {ok: false, error: string}}
 */
export function parseTrackerImport(input) {
  let data = input;
  if (typeof input === 'string') {
    if (input.length > MAX_TRACKER_IMPORT_BYTES) return { ok: false, error: 'tooLarge' };
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: 'invalidJson' };
    }
  }
  if (!isPlainObject(data) || data.app !== 'iman') return { ok: false, error: 'notIman' };
  let payload;
  if (data.kind === 'tracker') payload = data;
  else if (data.kind === 'backup') payload = data.tracker;
  else return { ok: false, error: 'wrongKind' };
  if (!isPlainObject(payload) || !isPlainObject(payload.days)) {
    return { ok: false, error: 'invalidShape' };
  }
  const { days, ignored } = validateDays(payload.days);
  return { ok: true, days, ignored };
}

export function createTracker({ storage, key = STORAGE_KEYS.tracker }) {
  const stored = readJSON(storage, key, null);
  let { days } = validateDays(migrateTracker(stored));
  const listeners = new Set();

  const save = () => writeJSON(storage, key, { version: TRACKER_VERSION, days });
  const emit = (date) => {
    for (const fn of listeners) {
      try {
        fn(date);
      } catch (err) {
        console.error(err);
      }
    }
  };

  function update(date, mutate) {
    if (!isYmd(date)) return;
    const next = {
      ...(days[date] ?? {}),
      sunnah: { ...(days[date]?.sunnah ?? {}) },
      meta: { ...(days[date]?.meta ?? {}) },
    };
    mutate(next);
    const clean = validateDay(next);
    const copy = { ...days };
    if (clean) copy[date] = clean;
    else delete copy[date];
    days = copy;
    save();
    emit(date);
  }

  return {
    getDay: (date) => days[date] ?? {},
    all: () => days,
    /**
     * Set a prayer's status. `meta` (travel flags) is optional: undefined
     * keeps the current flags, null clears them, an object replaces them.
     * Clearing the status clears its flags too.
     */
    setStatus(date, prayer, status, meta) {
      update(date, (d) => {
        if (status) d[prayer] = status;
        else delete d[prayer];
        if (!status || meta === null) delete d.meta[prayer];
        else if (meta) d.meta[prayer] = meta;
      });
    },
    setMeta(date, prayer, meta) {
      update(date, (d) => {
        if (meta) d.meta[prayer] = meta;
        else delete d.meta[prayer];
      });
    },
    /** Mark or unmark a day spent travelling. */
    setTravelDay(date, travelling) {
      if (Boolean(days[date]?.travel) === Boolean(travelling)) return;
      update(date, (d) => {
        if (travelling) d.travel = true;
        else delete d.travel;
      });
    },
    setSunnah(date, name, done) {
      update(date, (d) => {
        if (done) d.sunnah[name] = true;
        else delete d.sunnah[name];
      });
    },
    setWake(date, hhmm) {
      update(date, (d) => (d.wake = hhmm));
    },
    exportData: () => ({
      app: 'iman',
      kind: 'tracker',
      version: TRACKER_VERSION,
      exportedAt: new Date().toISOString(),
      days,
    }),
    /** Merge imported days (imported values win for the same date). */
    importData(input) {
      const res = parseTrackerImport(input);
      if (!res.ok) return res;
      days = { ...days, ...res.days };
      save();
      emit(null);
      return { ok: true, days: Object.keys(res.days).length, ignored: res.ignored };
    },
    clear() {
      days = {};
      save();
      emit(null);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
