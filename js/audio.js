// Sound: a synthesised chime and alarm tones (Web Audio, nothing to license),
// plus user-provided adhan / alarm files (IndexedDB or assets/audio/).
//
// iOS only allows audio after a tap, so unlockAudio() runs on the first
// pointer/key event. iOS also ignores media element .volume; routing files
// through a Web Audio GainNode makes volume and ramp-up work there too.

import { idbGet, idbSet, idbDelete } from './idb.js';

const AUDIO_KEYS = {
  adhan: 'audio:adhan',
  'adhan-fajr': 'audio:adhan-fajr',
  alarm: 'audio:alarm',
};
// Self-hosters can ship their own files: put them in assets/audio/ and list
// them in assets/audio/sounds.json, e.g. { "adhan": "adhan.mp3" }. Listing
// files (instead of probing for them) avoids 404s when none are bundled.
const SOUNDS_MANIFEST = 'assets/audio/sounds.json';
let manifestPromise = null;
function bundledSounds() {
  manifestPromise ??= fetch(SOUNDS_MANIFEST)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return manifestPromise;
}
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

let ctx = null;

/** The shared AudioContext (created lazily), or null if unsupported. */
export function audioContext() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/** Resume audio inside a user gesture (required on iOS and by autoplay rules). */
export function unlockAudio() {
  const c = audioContext();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  // Playing a silent buffer finishes the unlock on older iOS.
  const buf = c.createBuffer(1, 1, 22050);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(0);
}

/** Unlock audio on the first tap or key press. */
export function setupAudioUnlock(target = globalThis) {
  const once = () => {
    unlockAudio();
    target.removeEventListener('pointerdown', once, true);
    target.removeEventListener('keydown', once, true);
  };
  target.addEventListener('pointerdown', once, true);
  target.addEventListener('keydown', once, true);
}

/**
 * Ask iOS to play through the silent switch ("playback" session) while an
 * alarm is sounding, and give the session back afterwards.
 */
export function setPlaybackSession(on) {
  try {
    if (globalThis.navigator?.audioSession) navigator.audioSession.type = on ? 'playback' : 'auto';
  } catch {
    /* not supported */
  }
}

function note(c, dest, { freq, start, dur, type = 'sine', gain = 0.4, attack = 0.01 }) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.05);
  return osc;
}

/** A soft three-note bell chime. Volume 0..1. Returns its length in seconds. */
export function playChime(volume = 0.8) {
  const c = audioContext();
  if (!c) return 0;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const master = c.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(c.destination);
  const t0 = c.currentTime + 0.05;
  [784, 659.25, 523.25].forEach((f, i) => {
    const start = t0 + i * 0.35;
    note(c, master, { freq: f, start, dur: 1.8, gain: 0.35 });
    note(c, master, { freq: f * 2, start, dur: 0.9, gain: 0.08 });
    note(c, master, { freq: f * 3.01, start, dur: 0.5, gain: 0.03 });
  });
  return 2.6;
}

// ---------------------------------------------------------------- alarm tones

const PATTERNS = {
  // "dee-doo", like a gentle beacon.
  beacon: {
    period: 1.1,
    play(c, dest, t) {
      note(c, dest, { freq: 880, start: t, dur: 0.22, type: 'triangle', gain: 0.6 });
      note(c, dest, { freq: 659.25, start: t + 0.26, dur: 0.3, type: 'triangle', gain: 0.6 });
    },
  },
  // Classic quick beeps.
  pulse: {
    period: 1.0,
    play(c, dest, t) {
      for (let i = 0; i < 4; i++) {
        note(c, dest, {
          freq: 1046.5,
          start: t + i * 0.13,
          dur: 0.08,
          type: 'square',
          gain: 0.25,
          attack: 0.005,
        });
      }
    },
  },
  // Rising sweep.
  rising: {
    period: 0.9,
    play(c, dest, t) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(990, t + 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.3, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.7);
    },
  },
};

/**
 * Start a looping alarm that ramps from quiet to `maxVolume` over `rampSeconds`.
 * `tone` is a pattern name or "custom" (user file; falls back to "beacon").
 * @returns {Promise<{stop: () => void}>}
 */
export async function startAlarm({ tone = 'beacon', rampSeconds = 30, maxVolume = 1 } = {}) {
  const c = audioContext();
  if (!c) return { stop() {} };
  setPlaybackSession(true);
  if (c.state === 'suspended') await c.resume().catch(() => {});
  const master = c.createGain();
  const now = c.currentTime;
  const max = Math.max(0.05, Math.min(1, maxVolume));
  master.gain.setValueAtTime(rampSeconds > 0 ? Math.min(0.08, max) : max, now);
  if (rampSeconds > 0) master.gain.linearRampToValueAtTime(max, now + rampSeconds);
  master.connect(c.destination);

  let stopFile = null;
  if (tone === 'custom') {
    const src = await audioSource('alarm');
    if (src) {
      const el = new Audio(src);
      el.loop = true;
      try {
        c.createMediaElementSource(el).connect(master);
        await el.play();
        stopFile = () => el.pause();
      } catch {
        stopFile = null;
      }
    }
  }

  let timer = null;
  if (!stopFile) {
    const pattern = PATTERNS[tone] ?? PATTERNS.beacon;
    let next = c.currentTime + 0.1;
    const schedule = () => {
      while (next < c.currentTime + 0.3) {
        pattern.play(c, master, next);
        next += pattern.period;
      }
    };
    schedule();
    timer = setInterval(schedule, 50);
  }

  return {
    stop() {
      clearInterval(timer);
      stopFile?.();
      try {
        master.gain.cancelScheduledValues(c.currentTime);
        master.gain.setValueAtTime(0, c.currentTime);
        master.disconnect();
      } catch {
        /* already stopped */
      }
      setPlaybackSession(false);
    },
  };
}

// ---------------------------------------------------------------- audio files

const urlCache = new Map();

/** An object/relative URL for a user audio file, or null if none was added. */
export async function audioSource(kind) {
  if (urlCache.has(kind)) return urlCache.get(kind);
  let url = null;
  try {
    const stored = await idbGet(AUDIO_KEYS[kind]);
    if (stored?.blob) url = URL.createObjectURL(stored.blob);
  } catch {
    /* no IndexedDB */
  }
  if (!url) {
    const file = (await bundledSounds())[kind];
    // Plain file names only: no paths or URLs from the manifest.
    if (typeof file === 'string' && /^[\w.-]+\.(mp3|m4a|aac|ogg|wav)$/i.test(file)) {
      url = `assets/audio/${file}`;
    }
  }
  urlCache.set(kind, url);
  return url;
}

/** Name of the stored user file for `kind` (or null). */
export async function audioFileName(kind) {
  try {
    return (await idbGet(AUDIO_KEYS[kind]))?.name ?? null;
  } catch {
    return null;
  }
}

export async function saveAudioFile(kind, file) {
  if (!file || file.size > MAX_AUDIO_BYTES)
    throw Object.assign(new Error('too large'), { code: 'tooLarge' });
  if (file.type && !file.type.startsWith('audio/'))
    throw Object.assign(new Error('not audio'), { code: 'notAudio' });
  await idbSet(AUDIO_KEYS[kind], { name: file.name.slice(0, 120), type: file.type, blob: file });
  forget(kind);
}

export async function removeAudioFile(kind) {
  await idbDelete(AUDIO_KEYS[kind]);
  forget(kind);
}

function forget(kind) {
  const url = urlCache.get(kind);
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  urlCache.delete(kind);
}

let current = null;

/** Stop the adhan / chime that is playing, if any. */
export function stopSound() {
  current?.stop();
  current = null;
}

export const isPlaying = () => current !== null;

/**
 * Play a reminder sound: "adhan", "adhan-fajr", "chime" or "silent".
 * Adhan falls back to the normal adhan, then to the chime, when no file exists.
 * @returns {Promise<'adhan'|'chime'|'none'>} what actually played
 */
export async function playSound(sound, volume = 0.8) {
  if (sound === 'silent' || volume <= 0) return 'none';
  stopSound();
  if (sound === 'adhan' || sound === 'adhan-fajr') {
    const src =
      (sound === 'adhan-fajr' ? await audioSource('adhan-fajr') : null) ??
      (await audioSource('adhan'));
    if (src) {
      const el = new Audio(src);
      const c = audioContext();
      let gain = null;
      try {
        if (c) {
          gain = c.createGain();
          gain.gain.value = volume;
          c.createMediaElementSource(el).connect(gain).connect(c.destination);
        } else el.volume = volume;
        await el.play();
        const handle = {
          stop() {
            el.pause();
            gain?.disconnect();
          },
        };
        current = handle;
        el.addEventListener('ended', () => {
          if (current === handle) current = null;
        });
        return 'adhan';
      } catch {
        /* blocked or unsupported: fall back to the chime */
      }
    }
  }
  playChime(volume);
  return 'chime';
}
