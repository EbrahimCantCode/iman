// Small persistent UI state (not settings): onboarding done, dismissed cards,
// alerts already shown, etc. Kept separate so "Reset settings" never touches it.

import { STORAGE_KEYS } from './config/constants.js';
import { readJSON, writeJSON, isPlainObject } from './storage.js';

export function createState({ storage, key = STORAGE_KEYS.state }) {
  let data = readJSON(storage, key, {});
  if (!isPlainObject(data)) data = {};
  const save = () => writeJSON(storage, key, data);
  return {
    get: (k, fallback = undefined) => (Object.hasOwn(data, k) ? data[k] : fallback),
    set(k, v) {
      data = { ...data, [k]: v };
      save();
    },
    remove(k) {
      if (!Object.hasOwn(data, k)) return;
      const rest = { ...data };
      delete rest[k];
      data = rest;
      save();
    },
  };
}
