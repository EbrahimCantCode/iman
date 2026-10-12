import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parseWakeParams, buildWakeLink } from '../js/wake-params.js';
import {
  initialWakeState,
  wakeReducer,
  attemptsLeft,
  makeProblem,
  makeProblems,
  checkAnswer,
} from '../js/wake-logic.js';
import {
  pickDetection,
  colorHistogram,
  histogramSimilarity,
  encodeHistogram,
  decodeHistogram,
  HIST_BINS,
} from '../js/sink-check.js';
import { defaultValues } from '../js/settings.js';

describe('wake.html URL parameters', () => {
  const stored = defaultValues();

  test('works with no parameters and no stored settings (defaults)', () => {
    const { values, fromUrl } = parseWakeParams('', stored);
    assert.equal(values['wake.threshold'], 0.6);
    assert.equal(values['wake.attempts'], 5);
    assert.deepEqual(values['wake.objects'], ['sink']);
    assert.deepEqual(fromUrl, []);
  });

  test('reads the documented parameters', () => {
    const { values } = parseWakeParams(
      '?threshold=0.75&attempts=8&math=4&difficulty=hard&objects=sink,toilet&tone=pulse&ramp=60&volume=70&lang=ar&dev=1',
      stored,
    );
    assert.equal(values['wake.threshold'], 0.75);
    assert.equal(values['wake.attempts'], 8);
    assert.equal(values['wake.mathCount'], 4);
    assert.equal(values['wake.mathDifficulty'], 'hard');
    assert.deepEqual(values['wake.objects'], ['sink', 'toilet']);
    assert.equal(values['wake.tone'], 'pulse');
    assert.equal(values['wake.ramp'], 60);
    assert.equal(values['wake.maxVolume'], 70);
    assert.equal(values['appearance.language'], 'ar');
    assert.equal(values['advanced.devMode'], true);
  });

  test('clamps numbers and ignores invalid values', () => {
    const { values, fromUrl } = parseWakeParams(
      '?threshold=5&attempts=abc&difficulty=impossible&objects=cat,dog&tone=<script>',
      { ...stored, 'wake.attempts': 7 },
    );
    assert.equal(values['wake.threshold'], 0.95); // clamped
    assert.equal(values['wake.attempts'], 7); // invalid: stored value kept
    assert.equal(values['wake.mathDifficulty'], 'medium');
    assert.deepEqual(values['wake.objects'], ['sink']); // no valid object
    assert.equal(values['wake.tone'], 'beacon');
    assert.deepEqual(fromUrl, ['wake.threshold']);
  });

  test('URL parameters override stored settings', () => {
    const { values } = parseWakeParams('?attempts=3', { ...stored, 'wake.attempts': 10 });
    assert.equal(values['wake.attempts'], 3);
  });

  test('a reference histogram turns the anti-cheat check on; junk is rejected', () => {
    const ref = encodeHistogram(new Array(HIST_BINS).fill(1 / HIST_BINS));
    assert.equal(parseWakeParams(`?ref=${ref}`, stored).values['wake.refPhoto'], true);
    const bad = parseWakeParams('?ref=%3Cscript%3E', stored).values;
    assert.equal(bad['wake.refHist'], '');
    assert.equal(bad['wake.refPhoto'], false);
    const huge = parseWakeParams(`?ref=${'a'.repeat(400)}`, stored).values;
    assert.equal(huge['wake.refHist'], '');
  });

  test('buildWakeLink round-trips through parseWakeParams', () => {
    const mine = {
      ...stored,
      'wake.threshold': 0.7,
      'wake.attempts': 6,
      'wake.objects': ['sink', 'toothbrush'],
      'wake.refPhoto': true,
      'wake.refHist': encodeHistogram(new Array(HIST_BINS).fill(1 / HIST_BINS)),
      'appearance.language': 'ar',
    };
    const link = buildWakeLink('https://example.github.io/iman/wake.html?old=1#x', mine);
    const url = new URL(link);
    assert.equal(url.pathname, '/iman/wake.html');
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('old'), null);
    const { values } = parseWakeParams(url.search, defaultValues());
    for (const key of ['wake.threshold', 'wake.attempts', 'wake.refHist', 'appearance.language']) {
      assert.deepEqual(values[key], mine[key], key);
    }
    assert.deepEqual(values['wake.objects'], ['sink', 'toothbrush']);
  });

  test('the link leaves out the reference photo when the check is off', () => {
    const link = buildWakeLink('https://x.test/wake.html', { ...stored, 'wake.refHist': 'AAAA' });
    assert.equal(new URL(link).searchParams.has('ref'), false);
  });
});

describe('wake check fallback logic', () => {
  const start = (opts) => wakeReducer(initialWakeState(opts), { type: 'start' });

  test('the challenge unlocks only after the configured number of failures', () => {
    let s = start({ attempts: 3 });
    s = wakeReducer(s, { type: 'fail' });
    s = wakeReducer(s, { type: 'fail' });
    assert.equal(s.fallbackAvailable, false);
    assert.equal(attemptsLeft(s), 1);
    assert.equal(wakeReducer(s, { type: 'openFallback' }).phase, 'alarm'); // still locked
    s = wakeReducer(s, { type: 'fail' });
    assert.equal(s.fallbackAvailable, true);
    assert.equal(s.fallbackReason, 'attempts');
  });

  test('the challenge unlocks immediately if the camera or detector is unavailable', () => {
    const s = wakeReducer(start(), { type: 'unavailable', reason: 'denied' });
    assert.equal(s.fallbackAvailable, true);
    assert.equal(s.fallbackReason, 'denied');
  });

  test('a detected sink ends it', () => {
    const s = wakeReducer(start(), { type: 'success' });
    assert.equal(s.phase, 'done');
    assert.equal(s.result, 'photo');
  });

  test('solving every problem ends it; wrong answers do not advance', () => {
    let s = wakeReducer(start({ mathCount: 2 }), { type: 'unavailable' });
    s = wakeReducer(s, { type: 'openFallback', rng: () => 0.5 });
    assert.equal(s.phase, 'challenge');
    assert.equal(s.problems.length, 2);
    s = wakeReducer(s, { type: 'answer', value: 'nope' });
    assert.equal(s.solved, 0);
    assert.equal(s.wrong, 1);
    s = wakeReducer(s, { type: 'answer', value: String(s.problems[0].answer) });
    assert.equal(s.solved, 1);
    s = wakeReducer(s, { type: 'answer', value: String(s.problems[1].answer) });
    assert.equal(s.phase, 'done');
    assert.equal(s.result, 'challenge');
  });

  test('nothing happens before start or after done', () => {
    const ready = initialWakeState();
    assert.equal(wakeReducer(ready, { type: 'success' }).phase, 'ready');
    const done = wakeReducer(start(), { type: 'success' });
    assert.equal(wakeReducer(done, { type: 'fail' }).failures, 0);
  });
});

describe('arithmetic problems', () => {
  const seq = (...xs) => {
    let i = 0;
    return () => xs[i++ % xs.length];
  };

  test('difficulties produce correct answers in range', () => {
    for (const d of ['easy', 'medium', 'hard']) {
      for (const p of makeProblems(50, d)) {
        assert.equal(evaluate(p.text), p.answer, `${d}: ${p.text}`);
      }
    }
  });

  test('deterministic with an injected random source', () => {
    assert.deepEqual(makeProblem('easy', seq(0, 0.999)), { text: '2 + 20', answer: 22 });
    assert.deepEqual(makeProblem('hard', seq(0, 0, 0)), { text: '6 × 3 + 11', answer: 29 });
  });

  test('answers in Arabic-Indic digits are accepted', () => {
    const p = { text: '7 × 8', answer: 56 };
    assert.equal(checkAnswer(p, '56'), true);
    assert.equal(checkAnswer(p, ' ٥٦ '), true);
    assert.equal(checkAnswer(p, '۵۶'), true);
    assert.equal(checkAnswer(p, '57'), false);
    assert.equal(checkAnswer(p, '5 6'), false);
    assert.equal(checkAnswer(p, ''), false);
  });
});

/** Tiny evaluator for "a + b", "a × b" and "a × b + c" (no eval). */
function evaluate(text) {
  const m = /^(\d+) ([+×]) (\d+)(?: \+ (\d+))?$/.exec(text);
  const [a, op, b, c = 0] = [Number(m[1]), m[2], Number(m[3]), Number(m[4] ?? 0)];
  return (op === '+' ? a + b : a * b) + c;
}

describe('detection and reference photo helpers', () => {
  const preds = [
    { class: 'sink', score: 0.55 },
    { class: 'toilet', score: 0.8 },
    { class: 'person', score: 0.99 },
  ];

  test('pickDetection uses only accepted objects and the threshold', () => {
    assert.deepEqual(pickDetection(preds, ['sink'], 0.6), {
      pass: false,
      best: { class: 'sink', score: 0.55 },
    });
    assert.equal(pickDetection(preds, ['sink'], 0.5).pass, true);
    assert.equal(pickDetection(preds, ['sink', 'toilet'], 0.6).best.class, 'toilet');
    assert.deepEqual(pickDetection([], ['sink'], 0.6), { pass: false, best: null });
  });

  const image = (pixels) => new Uint8ClampedArray(pixels.flatMap(([r, g, b]) => [r, g, b, 255]));
  const white = image(new Array(100).fill([240, 240, 240]));
  const whiteish = image([
    ...new Array(90).fill([235, 238, 240]),
    ...new Array(10).fill([120, 90, 60]),
  ]);
  const green = image(new Array(100).fill([30, 160, 60]));

  test('histograms sum to 1 and compare sensibly', () => {
    const h = colorHistogram(white);
    assert.equal(h.length, HIST_BINS);
    assert.ok(Math.abs(h.reduce((a, b) => a + b, 0) - 1) < 1e-9);
    assert.ok(histogramSimilarity(h, h) > 0.999);
    assert.ok(histogramSimilarity(h, colorHistogram(whiteish)) > 0.9);
    assert.ok(histogramSimilarity(h, colorHistogram(green)) < 0.1);
  });

  test('histograms survive the base64url round trip used in links', () => {
    const h = colorHistogram(whiteish);
    const code = encodeHistogram(h);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
    assert.equal(code.length, 48);
    const back = decodeHistogram(code);
    assert.ok(histogramSimilarity(h, back) > 0.999);
    assert.equal(decodeHistogram('short'), null);
    assert.equal(decodeHistogram('bad chars!'), null);
    assert.equal(decodeHistogram(null), null);
  });
});
