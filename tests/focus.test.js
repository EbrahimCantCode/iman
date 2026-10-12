import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { activeFocusWindow } from '../js/focus.js';
import { getSchedule } from '../js/prayer.js';
import { defaultValues } from '../js/settings.js';

const MANAMA = { lat: 26.2235, lon: 50.5876, tz: 'Asia/Bahrain', country: 'BH' };
const base = { ...defaultValues(), 'prayer.method': 'Kuwait' };
const bh = (s) => new Date(`${s}+03:00`);
const at = (s, values = base) => {
  const now = bh(s);
  return activeFocusWindow(now, getSchedule(now, MANAMA, values), values);
};

describe('focus lock window', () => {
  test('starts at the adhan and lasts the configured duration', () => {
    assert.equal(at('2026-10-12T14:43:59'), null);
    assert.equal(at('2026-10-12T14:44:00').prayer, 'asr');
    assert.equal(at('2026-10-12T14:58:59').prayer, 'asr');
    assert.equal(at('2026-10-12T14:59:00'), null); // 15 min default
  });

  test('respects the start offset', () => {
    const v = { ...base, 'focus.offset': 5, 'focus.duration': 10 };
    assert.equal(at('2026-10-12T14:46:00', v), null);
    assert.equal(at('2026-10-12T14:49:00', v).prayer, 'asr');
    assert.equal(at('2026-10-12T14:59:00', v), null);
  });

  test('only for the selected prayers, and not when disabled', () => {
    assert.equal(at('2026-10-12T14:45:00', { ...base, 'focus.prayers': ['fajr'] }), null);
    assert.equal(at('2026-10-12T14:45:00', { ...base, 'focus.enabled': false }), null);
  });

  test('ids identify the day and prayer', () => {
    const w = at('2026-10-12T18:30:00');
    assert.equal(w.id, '2026-10-12:isha');
    assert.equal(w.end - w.start, 15 * 60_000);
  });

  test('a late Isha window continues past midnight (yesterday is checked too)', () => {
    // Summer at high latitudes: Isha can be close to midnight.
    const schedule = {
      yesterday: { day: '2026-06-20', isha: bh('2026-06-20T23:50:00') },
      today: { day: '2026-06-21', fajr: bh('2026-06-21T02:30:00') },
    };
    const v = { ...base, 'focus.duration': 30 };
    const w = activeFocusWindow(bh('2026-06-21T00:10:00'), schedule, v);
    assert.equal(w.id, '2026-06-20:isha');
    assert.equal(activeFocusWindow(bh('2026-06-21T00:21:00'), schedule, v), null);
  });
});
