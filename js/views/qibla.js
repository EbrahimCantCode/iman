// Qibla screen: bearing, distance to Makkah and a live compass dial.

import { h, svg, clear } from '../ui.js';
import { t, fmtNum } from '../i18n/index.js';
import {
  qiblaBearing,
  angleDiff,
  isAligned,
  startCompass,
  needsCompassPermission,
  requestCompassPermission,
} from '../qibla.js';
import { distanceToMakkahKm } from '../location.js';

const C = 150; // dial centre in SVG units

// iOS motion permission lasts for the page session once granted.
let permissionGranted = !needsCompassPermission();
const ALIGN_TOLERANCE = 5;

function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
}

function buildDial(bearing) {
  const dial = svg('g', { class: 'dial' });
  dial.append(svg('circle', { cx: C, cy: C, r: 140, class: 'dial-face' }));
  for (let d = 0; d < 360; d += 5) {
    const long = d % 30 === 0;
    const [x1, y1] = polar(140, d);
    const [x2, y2] = polar(long ? 124 : 132, d);
    dial.append(svg('line', { x1, y1, x2, y2, class: long ? 'tick tick-long' : 'tick' }));
  }
  for (const [deg, key] of [
    [0, 'n'],
    [90, 'e'],
    [180, 's'],
    [270, 'w'],
  ]) {
    const [x, y] = polar(108, deg);
    dial.append(
      svg('text', {
        x,
        y,
        class: ['cardinal', key === 'n' && 'cardinal-n'].filter(Boolean).join(' '),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        transform: `rotate(${deg} ${x} ${y})`,
        text: t(`qibla.${key}`),
      }),
    );
  }
  // Qibla line and Kaaba marker.
  const [lx, ly] = polar(96, bearing);
  dial.append(svg('line', { x1: C, y1: C, x2: lx, y2: ly, class: 'qibla-line' }));
  const [kx, ky] = polar(118, bearing);
  dial.append(
    svg(
      'g',
      { class: 'kaaba', transform: `translate(${kx} ${ky}) rotate(${bearing})` },
      svg('rect', { x: -10, y: -10, width: 20, height: 20, rx: 2.5, class: 'kaaba-body' }),
      svg('rect', { x: -10, y: -5, width: 20, height: 3.5, class: 'kaaba-band' }),
    ),
  );
  return dial;
}

export function createQiblaView(ctx) {
  const el = h('section', { class: 'view view-qibla', 'aria-labelledby': 'qibla-title' });
  let stop = null;
  let refs = null;
  let aligned = false;

  function stopCompass() {
    stop?.();
    stop = null;
  }

  function render() {
    stopCompass();
    clear(el);
    refs = null;
    el.append(h('h1', { id: 'qibla-title', class: 'view-title', text: t('qibla.title') }));
    const loc = ctx.location();
    if (!loc) {
      el.append(
        h(
          'div',
          { class: 'card' },
          h('p', { text: t('qibla.needLocation') }),
          h('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: t('today.setLocation'),
            onclick: () => ctx.openLocationPicker(),
          }),
        ),
      );
      return;
    }

    const bearing = qiblaBearing(loc.lat, loc.lon);
    const km = distanceToMakkahKm(loc);
    const dial = buildDial(bearing);
    const figure = h(
      'figure',
      { class: 'compass' },
      svg(
        'svg',
        {
          viewBox: '0 0 300 300',
          role: 'img',
          'aria-label': t('qibla.dialLabel', { deg: fmtNum(Math.round(bearing)) }),
        },
        dial,
        svg('path', { d: 'M150 2 L141 20 L159 20 Z', class: 'phone-mark' }),
        svg('circle', { cx: C, cy: C, r: 5, class: 'hub' }),
      ),
    );

    const heading = h('p', { class: 'qibla-heading num' });
    const status = h('p', { class: 'qibla-status', role: 'status', 'aria-live': 'polite' });
    const hint = h('p', { class: 'hint qibla-hint' });
    const startBtn = h('button', {
      type: 'button',
      class: 'btn btn-primary',
      text: t('qibla.start'),
      onclick: async () => {
        const perm = await requestCompassPermission();
        if (perm !== 'granted') {
          showStatic(t('qibla.denied'));
          return;
        }
        permissionGranted = true;
        begin();
      },
    });

    el.append(
      figure,
      h(
        'div',
        { class: 'qibla-info' },
        h('p', { class: 'qibla-bearing num', text: `${fmtNum(Math.round(bearing))}°` }),
        h('p', { class: 'hint', text: t('qibla.fromNorth') }),
        h('p', { class: 'hint', text: t('qibla.distance', { km: fmtNum(Math.round(km)) }) }),
        heading,
        status,
        hint,
        startBtn,
      ),
      h(
        'details',
        { class: 'card qibla-help' },
        h('summary', { text: t('qibla.calibrateTitle') }),
        h('p', { text: t('qibla.calibrate') }),
      ),
    );

    refs = { figure, dial, heading, status, hint, startBtn, bearing };
    showStatic(permissionGranted ? '' : t('qibla.permission'));
    if (permissionGranted) begin();
  }

  function showStatic(message) {
    if (!refs) return;
    refs.figure.classList.add('is-static');
    refs.dial.setAttribute('transform', 'rotate(0 150 150)');
    refs.heading.textContent = '';
    refs.hint.textContent = message || t('qibla.static');
  }

  function begin() {
    if (!refs) return;
    stopCompass();
    refs.startBtn.hidden = true;
    refs.hint.textContent = t('qibla.waiting');
    stop = startCompass({
      onHeading: (deg, accuracy) => update(deg, accuracy),
      onNoSensor: () => {
        stopCompass();
        showStatic(t('qibla.noSensor', { deg: fmtNum(Math.round(refs.bearing)) }));
      },
    });
  }

  function update(deg, accuracy) {
    if (!refs || !el.isConnected) return;
    const { figure, dial, heading, status, hint, bearing } = refs;
    figure.classList.remove('is-static');
    dial.setAttribute('transform', `rotate(${(-deg).toFixed(1)} 150 150)`);
    heading.textContent = t('qibla.heading', { deg: fmtNum(Math.round(deg)) });
    const diff = angleDiff(deg, bearing);
    const nowAligned = isAligned(deg, bearing, ALIGN_TOLERANCE);
    figure.classList.toggle('is-aligned', nowAligned);
    if (nowAligned !== aligned) {
      aligned = nowAligned;
      status.textContent = aligned ? t('qibla.aligned') : '';
      if (aligned) navigator.vibrate?.(60);
    }
    if (!aligned) {
      const n = fmtNum(Math.round(Math.abs(diff)));
      hint.textContent =
        diff > 0 ? t('qibla.turnRight', { deg: n }) : t('qibla.turnLeft', { deg: n });
    } else hint.textContent = '';
    if (accuracy != null && (accuracy < 0 || accuracy > 25))
      hint.textContent += ` ${t('qibla.lowAccuracy')}`;
  }

  return {
    el,
    render,
    onHide: stopCompass,
    onShow: () => {
      if (refs && !stop && permissionGranted) begin();
    },
    title: () => t('tab.qibla'),
  };
}
