// Qibla bearing and a device compass (DeviceOrientation) with smoothing.

import { Coordinates, Qibla } from '../lib/adhan/adhan.esm.min.js';

/** Qibla direction in degrees clockwise from true North. */
export function qiblaBearing(lat, lon) {
  return Qibla(new Coordinates(lat, lon));
}

/** Normalise any angle to [0, 360). */
export function norm360(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest rotation from `from` to `to`, in (-180, 180]. */
export function angleDiff(from, to) {
  const d = norm360(to - from);
  return d > 180 ? d - 360 : d;
}

/**
 * Low-pass filter for headings. Moves `prev` towards `next` by `alpha`
 * along the shortest arc, so 359° -> 1° goes through 0°, not back round.
 */
export function smoothHeading(prev, next, alpha = 0.2) {
  if (prev == null || !Number.isFinite(prev)) return norm360(next);
  return norm360(prev + alpha * angleDiff(prev, next));
}

export function isAligned(heading, bearing, tolerance = 5) {
  return Math.abs(angleDiff(heading, bearing)) <= tolerance;
}

/**
 * Compass heading (degrees from North of the top of the screen) from a
 * DeviceOrientation event, or null if the event has no absolute heading.
 * iOS: webkitCompassHeading. Others: 360 - alpha on an absolute event.
 */
export function headingFromEvent(e, screenAngle = 0) {
  if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassHeading >= 0) {
    return norm360(e.webkitCompassHeading + screenAngle);
  }
  if (
    (e.absolute === true || e.type === 'deviceorientationabsolute') &&
    typeof e.alpha === 'number'
  ) {
    return norm360(360 - e.alpha + screenAngle);
  }
  return null;
}

/** Whether the page must ask for motion permission from a tap (iOS 13+). */
export function needsCompassPermission() {
  return typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function';
}

/** Ask for motion/orientation permission. Must be called from a user gesture. */
export async function requestCompassPermission() {
  if (!needsCompassPermission()) return 'granted';
  try {
    return await DeviceOrientationEvent.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Start listening to the compass.
 * @param {{onHeading: (deg:number, accuracy:number|null) => void, onNoSensor: () => void}} handlers
 * @returns {() => void} stop function
 */
export function startCompass({ onHeading, onNoSensor, alpha = 0.2, timeout = 3000 }) {
  if (!('DeviceOrientationEvent' in globalThis)) {
    onNoSensor();
    return () => {};
  }
  const type =
    'ondeviceorientationabsolute' in globalThis ? 'deviceorientationabsolute' : 'deviceorientation';
  let smoothed = null;
  let gotReading = false;
  const screenAngle = () => globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0;

  const handler = (e) => {
    const raw = headingFromEvent(e, screenAngle());
    if (raw == null) return;
    gotReading = true;
    smoothed = smoothHeading(smoothed, raw, alpha);
    const acc = typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : null;
    onHeading(smoothed, acc);
  };
  globalThis.addEventListener(type, handler);
  const timer = setTimeout(() => {
    if (!gotReading) onNoSensor();
  }, timeout);
  return () => {
    clearTimeout(timer);
    globalThis.removeEventListener(type, handler);
  };
}
