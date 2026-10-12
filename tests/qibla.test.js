import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  qiblaBearing,
  smoothHeading,
  angleDiff,
  norm360,
  isAligned,
  headingFromEvent,
} from '../js/qibla.js';
import { distanceToMakkahKm, haversineKm } from '../js/location.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? ''} expected ${expected}±${tol}, got ${actual}`,
  );

describe('Qibla bearing', () => {
  test('Manama is about 246°', () => near(qiblaBearing(26.2235, 50.5876), 246, 0.5));
  test('London is about 119°', () => near(qiblaBearing(51.5074, -0.1278), 119, 0.5));
  test('New York is about 58.5°', () => near(qiblaBearing(40.7128, -74.006), 58.5, 0.5));
  test('Jakarta is about 295°', () => near(qiblaBearing(-6.2, 106.8), 295, 0.5));

  test('distance from Manama to Makkah is about 1,217 km', () => {
    near(distanceToMakkahKm({ lat: 26.2235, lon: 50.5876 }), 1217, 5);
    assert.equal(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 }), 0);
  });
});

describe('angles', () => {
  test('norm360 wraps any angle', () => {
    assert.equal(norm360(370), 10);
    assert.equal(norm360(-10), 350);
    assert.equal(norm360(720), 0);
  });

  test('angleDiff takes the shortest way round', () => {
    assert.equal(angleDiff(350, 10), 20);
    assert.equal(angleDiff(10, 350), -20);
    assert.equal(angleDiff(0, 180), 180);
    assert.equal(angleDiff(90, 90), 0);
  });

  test('isAligned uses a ±tolerance across north', () => {
    assert.equal(isAligned(358, 2, 5), true);
    assert.equal(isAligned(240, 246, 5), false);
    assert.equal(isAligned(242, 246, 5), true);
  });
});

describe('compass smoothing', () => {
  test('first reading passes through', () => {
    assert.equal(smoothHeading(null, 123), 123);
  });

  test('moves part of the way towards the new reading', () => {
    near(smoothHeading(100, 200, 0.2), 120, 1e-9);
  });

  test('wraps from 359° to 1° through north, not back round', () => {
    near(smoothHeading(359, 1, 0.5), 0, 1e-9);
    near(smoothHeading(1, 359, 0.5), 0, 1e-9);
    const v = smoothHeading(350, 10, 0.25);
    near(v, 355, 1e-9);
  });

  test('converges across the wrap without overshooting', () => {
    let h = 340;
    for (let i = 0; i < 60; i++) h = smoothHeading(h, 20, 0.2);
    near(h, 20, 0.01);
  });
});

describe('headingFromEvent', () => {
  test('iOS uses webkitCompassHeading', () => {
    assert.equal(headingFromEvent({ webkitCompassHeading: 246, alpha: 10 }), 246);
    assert.equal(headingFromEvent({ webkitCompassHeading: 350 }, 90), 80);
  });

  test('Android absolute events use 360 - alpha', () => {
    assert.equal(headingFromEvent({ type: 'deviceorientationabsolute', alpha: 90 }), 270);
    assert.equal(headingFromEvent({ absolute: true, alpha: 0 }), 0);
    assert.equal(headingFromEvent({ absolute: true, alpha: 10 }, 90), 80);
  });

  test('relative events without a compass give null', () => {
    assert.equal(headingFromEvent({ absolute: false, alpha: 90 }), null);
    assert.equal(headingFromEvent({ webkitCompassHeading: -1 }), null);
  });
});
