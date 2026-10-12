// Time-zone aware date helpers built on Intl (no dependencies).
//
// Dates are passed around as real instants (Date objects). Calendar days are
// "YYYY-MM-DD" strings in the location's time zone, which is what the tracker
// uses as keys and what adhan needs to compute a day's times.

const partsCache = new Map();

function partsFormatter(tz) {
  const key = tz || '';
  let f = partsCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    });
    partsCache.set(key, f);
  }
  return f;
}

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock parts of `date` in time zone `tz` (device zone when empty). */
export function zonedParts(date, tz) {
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS[out.weekday],
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Calendar day "YYYY-MM-DD" of `date` in `tz`. */
export function ymd(date, tz) {
  const p = zonedParts(date, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

export const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(s) {
  const m = YMD_RE.exec(s);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** Whether `s` is a real calendar date in YYYY-MM-DD form. */
export function isYmd(s) {
  const p = typeof s === 'string' && parseYmd(s);
  if (!p) return false;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return (
    d.getUTCFullYear() === p.year && d.getUTCMonth() === p.month - 1 && d.getUTCDate() === p.day
  );
}

/** Add `n` days to a "YYYY-MM-DD" string. */
export function addDays(s, n) {
  const p = parseYmd(s);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Whole days from `a` to `b` (both "YYYY-MM-DD"). */
export function daysBetween(a, b) {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86400000,
  );
}

/** Day of week for a "YYYY-MM-DD" string: 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(s) {
  const p = parseYmd(s);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/**
 * A Date whose *device-local* year/month/day equal the given calendar day.
 * adhan reads getFullYear()/getMonth()/getDate(), so this lets us compute
 * times for a city in another time zone. Noon avoids DST edge cases.
 */
export function adhanDate(s) {
  const p = parseYmd(s);
  return new Date(p.year, p.month - 1, p.day, 12, 0, 0);
}

/** Minutes since local midnight in `tz`. */
export function minutesOfDay(date, tz) {
  const p = zonedParts(date, tz);
  return p.hour * 60 + p.minute;
}

/** "HH:MM" -> minutes since midnight. */
export function hmToMinutes(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Whether minute-of-day `m` is inside [start, end), wrapping past midnight. */
export function inDailyRange(m, start, end) {
  if (start === end) return false;
  return start < end ? m >= start && m < end : m >= start || m < end;
}

/** UTC offset of `tz` at instant `date`, in minutes (e.g. +180 for Asia/Bahrain). */
export function tzOffsetMinutes(date, tz) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/**
 * The instant at which the wall clock in `tz` shows the given local time
 * ("YYYY-MM-DDTHH:MM" or "...:SS"). Independent of the device's time zone.
 */
export function zonedTimeToDate(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local ?? '');
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map((x) => Number(x ?? 0));
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // Two passes handle offsets that change around the target (DST).
  let t = guess - tzOffsetMinutes(new Date(guess), tz) * 60000;
  t = guess - tzOffsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}

/** "YYYY-MM-DDTHH:MM:SS" wall-clock time of `date` in `tz` (for datetime-local inputs). */
export function toZonedInput(date, tz) {
  const p = zonedParts(date, tz);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** ISO 8601 with the zone's offset, e.g. "2026-10-12T11:23:50+03:00". */
export function toZonedIso(date, tz) {
  const off = tzOffsetMinutes(date, tz);
  const sign = off < 0 ? '-' : '+';
  const a = Math.abs(off);
  return `${toZonedInput(date, tz)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** The device's IANA time zone, or "" if unknown. */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Format a duration in ms as H:MM:SS / HH:MM:SS (never negative). */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
