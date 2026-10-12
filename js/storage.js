// Safe wrapper around localStorage. Storage can be missing or throw (private
// browsing, blocked site data, quota), so every access is guarded and falls
// back to an in-memory map: the app keeps working, it just won't persist.

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    persistent: false,
  };
}

let cached;

/** The best available Storage-like object (localStorage or an in-memory map). */
export function getStorage() {
  if (cached) return cached;
  try {
    const s = globalThis.localStorage;
    const probe = '__iman_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    cached = s;
  } catch {
    cached = createMemoryStorage();
  }
  return cached;
}

export { createMemoryStorage };

/** Parse JSON from storage; returns `fallback` on any problem. */
export function readJSON(storage, key, fallback = null) {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Write JSON to storage; returns false if it could not be saved. */
export function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** True for a plain JSON object (not null, not an array). */
export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
