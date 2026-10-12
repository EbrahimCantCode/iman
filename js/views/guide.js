// Setup guide (#guide): installing, Focus mode, Shortcuts automations and the
// Fajr wake check on iPhone, plus a shorter Android section. The same steps
// are in the README; keep them in sync.

import { h, clear, toast, copyText } from '../ui.js';
import { icon } from '../icons.js';
import { t, fmtTime, fmtDate } from '../i18n/index.js';
import { computeDay } from '../prayer.js';
import { addDays, ymd, minutesOfDay } from '../time.js';
import { PRAYERS } from '../config/constants.js';
import { wakeLink } from './wake-widget.js';

/** Number of steps per guide section (strings: guide.<platform>.<section>.<n>). */
const SECTIONS = {
  ios: { install: 5, focus: 3, auto: 4, fajr: 5 },
  android: { install: 3, focus: 2, wake: 3 },
};

/** Plain-text prayer times for the next 7 days, plus earliest/latest per prayer. */
export function weekTimesText(ctx) {
  const loc = ctx.location();
  if (!loc) return '';
  const values = ctx.values();
  const start = ymd(ctx.now(), loc.tz);
  const days = Array.from({ length: 7 }, (_, i) => computeDay(loc, addDays(start, i), values));
  const noon = (d) => new Date(`${d}T12:00:00Z`);
  const lines = [
    t('guide.weekHeader', {
      place: ctx.locationName(loc),
      method: t(`opt.method.${days[0].methodId}`),
    }),
    '',
  ];
  for (const d of days) {
    const times = PRAYERS.map((p) => `${t(`prayer.${p}`)} ${fmtTime(d[p], loc.tz)}`).join(' · ');
    lines.push(
      `${fmtDate(noon(d.day), 'UTC', { weekday: 'short', day: 'numeric', month: 'short' })}: ${times}`,
    );
  }
  lines.push('', t('guide.weekRange'));
  for (const p of PRAYERS) {
    // Compare by time of day, not by date.
    const sorted = days
      .map((d) => d[p])
      .filter(Boolean)
      .sort((a, b) => minutesOfDay(a, loc.tz) - minutesOfDay(b, loc.tz));
    lines.push(
      `${t(`prayer.${p}`)}: ${fmtTime(sorted[0], loc.tz)} – ${fmtTime(sorted.at(-1), loc.tz)}`,
    );
  }
  lines.push('', t('guide.weekFocus', { min: values['focus.duration'] }));
  return lines.join('\n');
}

export function createGuideView(ctx) {
  const el = h('section', { class: 'view view-guide', 'aria-labelledby': 'guide-title' });
  let platform = /android/i.test(navigator.userAgent) ? 'android' : 'ios';

  function steps(section) {
    const n = SECTIONS[platform][section];
    const params = {
      url: new URL('.', location.href).href,
      min: ctx.values()['focus.duration'],
    };
    return h(
      'ol',
      { class: 'guide-steps' },
      Array.from({ length: n }, (_, i) =>
        h('li', { text: t(`guide.${platform}.${section}.${i + 1}`, params) }),
      ),
    );
  }

  function section(key, extra = null) {
    return h(
      'section',
      { class: 'card guide-section', 'aria-labelledby': `g-${key}` },
      h('h2', { id: `g-${key}`, text: t(`guide.${platform}.${key}.title`) }),
      steps(key),
      extra,
    );
  }

  function weekBlock() {
    const text = weekTimesText(ctx);
    if (!text) return h('p', { class: 'hint', text: t('qibla.needLocation') });
    return h(
      'div',
      { class: 'guide-week' },
      h('p', { class: 'hint', text: t(`guide.tradeoff`) }),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: async () =>
            toast((await copyText(weekTimesText(ctx))) ? t('guide.weekCopied') : t('common.error')),
        },
        icon('copy'),
        t('guide.copyWeek'),
      ),
      h(
        'details',
        null,
        h('summary', { text: t('guide.preview') }),
        h('pre', { class: 'guide-pre', text }),
      ),
    );
  }

  function wakeBlock() {
    return h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          onclick: async () =>
            toast((await copyText(wakeLink(ctx))) ? t('wake.linkCopied') : t('common.error')),
        },
        icon('copy'),
        t('wake.copyLink'),
      ),
    );
  }

  function render() {
    clear(el);
    el.append(
      h(
        'a',
        { class: 'btn btn-ghost guide-back', href: '#settings' },
        icon('back'),
        t('common.back'),
      ),
      h('h1', { id: 'guide-title', class: 'view-title', text: t('guide.title') }),
      h('p', { class: 'hint', text: t('guide.intro') }),
    );
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('guide.platform') });
    for (const p of ['ios', 'android']) {
      seg.append(
        h('button', {
          type: 'button',
          'aria-pressed': String(p === platform),
          text: t(`guide.${p}`),
          onclick: () => {
            platform = p;
            render();
          },
        }),
      );
    }
    el.append(seg);

    if (platform === 'ios') {
      el.append(
        section('install'),
        section('focus'),
        section('auto', weekBlock()),
        section('fajr', [wakeBlock(), h('p', { class: 'hint', text: t('guide.ios.fajr.why') })]),
      );
    } else {
      el.append(section('install'), section('focus', weekBlock()), section('wake', wakeBlock()));
    }
    el.append(h('p', { class: 'hint', text: t('guide.menuNote') }));
  }

  return { el, render, title: () => t('guide.title') };
}
