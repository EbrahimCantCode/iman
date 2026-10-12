// wake.html: the Fajr wake check page. Works standalone (e.g. opened in
// Safari by a Shortcuts automation) using URL parameters, settings stored in
// this browser, or defaults - in that order of precedence.

import { initClock, now } from './clock.js';
import { getStorage } from './storage.js';
import { createSettingsStore } from './settings.js';
import { createTracker } from './tracker.js';
import { setLanguage, resolveLanguage, t, tn, dir, fmtNum, digits } from './i18n/index.js';
import { parseWakeParams } from './wake-params.js';
import { initialWakeState, wakeReducer, attemptsLeft } from './wake-logic.js';
import {
  loadDetector,
  startCamera,
  captureFrame,
  checkFrame,
  canvasHistogram,
  encodeHistogram,
  decodeHistogram,
} from './sink-check.js';
import { startAlarm, unlockAudio } from './audio.js';
import { locationFromSettings } from './location.js';
import { ymd, zonedParts } from './time.js';
import { h, clear } from './ui.js';
import { icon } from './icons.js';

initClock();
const storage = getStorage();
const settings = createSettingsStore({ storage });
const { values } = parseWakeParams(location.search, settings.all());
const registerMode = new URLSearchParams(location.search).has('register');
const dev = values['advanced.devMode'];
const objects = values['wake.objects'];
const refHist = values['wake.refPhoto'] ? decodeHistogram(values['wake.refHist']) : null;

const main = document.getElementById('main');
let state = initialWakeState({
  attempts: values['wake.attempts'],
  mathCount: values['wake.mathCount'],
  difficulty: values['wake.mathDifficulty'],
});
let alarm = null;
let camera = null;
let wakeLock = null;
let cameraReady = false;
let modelReady = false;
let message = null; // { kind: 'error'|'info', text }
let busy = false;
let cameraFailed = false;
let scores = '';

// Persistent elements (the video must survive re-renders).
const video = h('video', { class: 'wake-video', playsinline: true, muted: true, autoplay: true });
const canvas = h('canvas', { class: 'wake-still', hidden: true });

const objectName = () => objects.map((o) => t(`opt.object.${o}`).toLowerCase()).join(' / ');

// Start fetching the detector right away (it is cached for offline use).
const detector = loadDetector().then(
  () => (modelReady = true),
  (err) => {
    console.warn('Detector failed to load', err);
    return null;
  },
);

async function boot() {
  await setLanguage(resolveLanguage(values['appearance.language']), {
    numerals: values['appearance.numerals'],
    timeFormat: values['prayer.timeFormat'],
  });
  document.documentElement.lang = resolveLanguage(values['appearance.language']);
  document.documentElement.dir = dir();
  document.title = `${t(registerMode ? 'wake.registerTitle' : 'wake.title')} · ${t('app.name')}`;
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function send(event) {
  const prev = state.phase;
  state = wakeReducer(state, event);
  if (state.phase === 'done' && prev !== 'done') finish();
  render();
}

// ------------------------------------------------------------ actions

async function begin() {
  unlockAudio();
  if (!registerMode) {
    alarm = await startAlarm({
      tone: values['wake.tone'],
      rampSeconds: values['wake.ramp'],
      maxVolume: values['wake.maxVolume'] / 100,
    });
  }
  send({ type: 'start' });
  keepAwake();
  try {
    camera = await startCamera(video);
    cameraReady = true;
  } catch (err) {
    cameraFailed = true;
    message = {
      kind: 'error',
      text: t(err.code === 'denied' ? 'wake.cameraDenied' : 'wake.cameraUnavailable'),
    };
    send({ type: 'unavailable', reason: err.code });
    return;
  }
  render();
  detector.then((model) => {
    if (!model && state.phase === 'alarm') {
      message = { kind: 'error', text: t('wake.modelError') };
      send({ type: 'unavailable', reason: 'model' });
    } else render();
  });
}

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* not supported */
  }
}

async function capture() {
  if (!cameraReady) return;
  busy = true;
  captureFrame(video, canvas);
  canvas.hidden = false;
  message = { kind: 'info', text: t('wake.checking') };
  render();
  let res;
  try {
    res = await checkFrame(canvas, {
      objects,
      threshold: values['wake.threshold'],
      refHist: registerMode ? null : refHist,
      refThreshold: values['wake.refThreshold'],
    });
  } catch (err) {
    console.warn(err);
    busy = false;
    message = { kind: 'error', text: t('wake.modelError') };
    canvas.hidden = true;
    send({ type: 'unavailable', reason: 'model' });
    return;
  }
  if (dev) {
    const list = res.predictions.map((p) => `${p.class} ${p.score.toFixed(2)}`);
    console.info('[wake] detections:', list.join(', ') || 'none', 'similarity:', res.similarity);
    scores = t('wake.debugScores', {
      list: list.join(', ') || '—',
      sim: res.similarity == null ? '—' : res.similarity.toFixed(2),
    });
  }
  canvas.hidden = true;
  busy = false;

  if (registerMode) {
    if (res.detected) {
      settings.setMany({
        'wake.refHist': encodeHistogram(canvasHistogram(canvas)),
        'wake.refPhoto': true,
      });
      send({ type: 'success' });
    } else {
      message = { kind: 'error', text: t('wake.registerNeedSink', { object: objectName() }) };
      render();
    }
    return;
  }

  if (res.pass) {
    send({ type: 'success' });
    return;
  }
  message = {
    kind: 'error',
    text: res.detected
      ? t('wake.notSimilar', { score: fmtNum(Math.round(res.similarity * 100)) })
      : t('wake.fail', { object: objectName() }),
  };
  send({ type: 'fail' });
}

function finish() {
  alarm?.stop();
  alarm = null;
  camera?.stop();
  camera = null;
  wakeLock?.release?.().catch(() => {});
  if (registerMode) return;
  // Log the wake check in the tracker of this browser (if the app is used here).
  const loc = locationFromSettings(settings.all());
  const n = now();
  const p = zonedParts(n, loc?.tz);
  const hhmm = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  createTracker({ storage }).setWake(ymd(n, loc?.tz), hhmm);
}

// ------------------------------------------------------------ render

function render() {
  clear(main);
  const header = h(
    'header',
    { class: 'wake-head' },
    h('span', { class: 'wake-icon' }, icon(registerMode ? 'camera' : 'alarm')),
    h('h1', { text: t(registerMode ? 'wake.registerTitle' : 'wake.title') }),
  );
  main.append(header);

  if (state.phase === 'ready') renderReady();
  else if (state.phase === 'alarm') renderAlarm();
  else if (state.phase === 'challenge') renderChallenge();
  else renderDone();

  main.append(
    h('p', { class: 'hint wake-privacy' }, icon('info', { size: 16 }), t('wake.privacy')),
  );
}

function renderReady() {
  main.append(
    h('p', {
      class: 'wake-lead',
      text: t(registerMode ? 'wake.registerIntro' : 'wake.intro', { object: objectName() }),
    }),
    h('button', {
      type: 'button',
      class: 'btn btn-primary btn-lg btn-block wake-start',
      text: t(registerMode ? 'wake.registerStart' : 'wake.start'),
      onclick: begin,
    }),
    registerMode ? null : h('p', { class: 'hint', text: t('wake.startHelp') }),
  );
}

function renderAlarm() {
  if (!cameraFailed) {
    const status = !cameraReady
      ? t('wake.startingCamera')
      : !modelReady
        ? t('wake.loadingModel')
        : t('wake.aim', { object: objectName() });
    main.append(
      h('div', { class: 'wake-frame' }, video, canvas),
      h('p', { class: 'hint wake-status', role: 'status', 'aria-live': 'polite', text: status }),
    );
    // Re-attaching the element can pause it (iOS); keep the preview running.
    if (video.srcObject && video.paused) video.play().catch(() => {});
  }
  if (message) {
    main.append(
      h('p', { class: ['wake-msg', `is-${message.kind}`], role: 'alert', text: message.text }),
    );
    if (message.kind === 'error' && cameraReady && state.failures > 0) {
      main.append(h('p', { class: 'hint', text: t('wake.tips', { object: objectName() }) }));
    }
  }
  if (scores) main.append(h('p', { class: 'hint num', text: scores }));

  if (!cameraFailed) {
    main.append(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary btn-lg btn-block',
          disabled: !cameraReady || !modelReady || busy,
          onclick: capture,
        },
        icon('camera'),
        t(registerMode ? 'wake.registerCapture' : 'wake.takePhoto', { object: objectName() }),
      ),
    );
  }

  if (!registerMode) {
    if (state.fallbackAvailable) {
      main.append(
        h('button', {
          type: 'button',
          class: ['btn btn-block', cameraFailed && 'btn-primary btn-lg'],
          text: t('wake.useFallback'),
          onclick: () => send({ type: 'openFallback' }),
        }),
      );
    } else if (state.failures > 0) {
      main.append(h('p', { class: 'hint', text: tn('wake.attemptsLeft', attemptsLeft(state)) }));
    }
  }
}

function renderChallenge() {
  const problem = state.problems[state.solved];
  const input = h('input', {
    id: 'answer',
    class: 'input wake-answer',
    inputmode: 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-describedby': 'problem',
  });
  const submit = () => {
    const before = state.wrong;
    send({ type: 'answer', value: input.value });
    if (state.phase === 'challenge' && state.wrong > before) {
      const err = document.getElementById('wake-wrong');
      if (err) err.textContent = t('wake.wrong');
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  main.append(
    h('p', { class: 'wake-lead', text: t('wake.fallbackIntro', { n: state.problems.length }) }),
    h('p', {
      class: 'hint',
      text: t('wake.problemOf', { i: state.solved + 1, n: state.problems.length }),
    }),
    h('p', { class: 'wake-problem num', id: 'problem', text: `${digits(problem.text)} = ?` }),
    h('label', { for: 'answer', class: 'visually-hidden', text: t('wake.answer') }),
    input,
    h('p', { class: 'wake-msg is-error', id: 'wake-wrong', role: 'alert' }),
    h('button', {
      type: 'button',
      class: 'btn btn-primary btn-lg btn-block',
      text: t('wake.check'),
      onclick: submit,
    }),
  );
  input.focus();
}

function renderDone() {
  if (registerMode) {
    main.append(
      h('p', { class: 'wake-success', text: t('wake.registerSaved') }),
      h('a', {
        class: 'btn btn-primary btn-block',
        href: 'index.html#settings/wake',
        text: t('wake.backToSettings'),
      }),
    );
    return;
  }
  main.append(
    h('div', { class: 'wake-success-art' }, icon('crescent', { size: 56 })),
    h('p', { class: 'wake-success', text: t('wake.success') }),
    h('p', { class: 'wake-lead', text: t('wake.successBody') }),
    h('a', {
      class: 'btn btn-primary btn-block',
      href: 'index.html#today',
      text: t('wake.openApp'),
    }),
  );
}

boot();
