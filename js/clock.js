// The app's notion of "now". `?debugTime=2026-10-12T11:23:50` fakes the
// current time (it keeps ticking from there) so reminders and the focus lock
// can be tested without waiting. A banner is shown while it is active.

let offsetMs = 0;
let active = false;

const DEBUG_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/;

/** Parse a debugTime value; returns a Date or null. Without an offset it is device-local. */
export function parseDebugTime(value) {
  if (typeof value !== 'string' || !DEBUG_RE.test(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read ?debugTime from a query string (call once at startup). */
export function initClock(search = globalThis.location?.search ?? '') {
  const value = new URLSearchParams(search).get('debugTime');
  const d = parseDebugTime(value);
  if (d) {
    offsetMs = d.getTime() - Date.now();
    active = true;
  }
  return active;
}

export function now() {
  return new Date(Date.now() + offsetMs);
}

export function isDebugTime() {
  return active;
}

/** For tests: set the fake offset directly. */
export function setClockOffset(ms) {
  offsetMs = ms;
  active = ms !== 0;
}
