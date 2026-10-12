// Travel screen (#travel): status of the current trip, the rulings in
// effect (from js/config/travel-rules.js) with the disclaimer, the home
// location, and entry points to the trip planner and flight prayer times.

import { h, clear } from '../ui.js';
import { icon } from '../icons.js';
import { t, currentLanguage, fmtNum } from '../i18n/index.js';
import { distanceFromHome, toUnits } from '../travel.js';
import { placeName, fmtDistance, limitText } from './travel-ui.js';

/** Plain-language summary of the rules in effect. */
export function rulesSummary(r, units) {
  const lines = [];
  if (r.distanceRangeKm) {
    lines.push(
      t('travel.ruleDistance', {
        distance: fmtDistance(r.distanceKm, units),
        range: `${fmtNum(Math.round(toUnits(r.distanceRangeKm[0], units)))}–${fmtDistance(r.distanceRangeKm[1], units)}`,
      }),
    );
  } else {
    lines.push(t('travel.ruleDistanceCustom', { distance: fmtDistance(r.distanceKm, units) }));
  }
  lines.push(t('travel.ruleStay', { limit: limitText(r) }));
  lines.push(
    t(
      r.shortening === 'obligatory' ? 'travel.ruleShortenObligatory' : 'travel.ruleShortenOptional',
    ),
  );
  const c = r.combining;
  if (c.includes('early') && c.includes('delayed')) lines.push(t('travel.ruleCombineBoth'));
  else if (c.includes('early')) lines.push(t('travel.ruleCombineEarly'));
  else if (c.includes('delayed')) lines.push(t('travel.ruleCombineDelayed'));
  else
    lines.push(
      t(r.madhab === 'hanafi' ? 'travel.ruleCombineNoneHanafi' : 'travel.ruleCombineNone'),
    );
  if (r.formalCombining) lines.push(t('travel.ruleFormal'));
  return lines;
}

/** The disclaimer shown on every travel screen. */
export function disclaimer() {
  return h(
    'p',
    { class: 'note', role: 'note' },
    icon('info', { size: 18 }),
    h('span', { text: t('travel.disclaimer') }),
  );
}

export function createTravelView(ctx) {
  const el = h('section', { class: 'view view-travel', 'aria-labelledby': 'travel-title' });
  const travel = () => ctx.travel;

  // Sub-pages: #travel/trip/<id>, #travel/flight (registered by feature modules).
  let sub = '';
  let rest = [];

  function render() {
    const subview = ctx.hooks.travelSubviews[sub];
    if (subview) {
      clear(el);
      el.append(
        h(
          'a',
          { class: 'btn btn-ghost guide-back', href: '#travel' },
          icon('back', { className: 'icon-mirror' }),
          t('travel.title'),
        ),
      );
      subview(el, rest);
      return;
    }
    clear(el);
    const v = ctx.values();
    const c = travel();
    const r = c.rules();
    const cur = ctx.travelStore.current();
    el.append(
      h(
        'a',
        { class: 'btn btn-ghost guide-back', href: '#today' },
        icon('back', { className: 'icon-mirror' }),
        t('tab.today'),
      ),
      h('h1', { id: 'travel-title', class: 'view-title', text: t('travel.title') }),
      disclaimer(),
    );

    // Status
    const sw = h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'switch',
      id: 'travel-screen-switch',
      checked: c.active(),
      onchange: () => c.toggle(sw.checked),
    });
    const status = h(
      'section',
      { class: 'card', 'aria-labelledby': 'travel-status' },
      h(
        'div',
        { class: 'set-row travel-switch-row' },
        h(
          'label',
          { class: 'set-row-text', for: 'travel-screen-switch' },
          h('span', { class: 'set-row-label', id: 'travel-status', text: t('set.travel.enabled') }),
        ),
        sw,
      ),
    );
    if (c.active() && cur) {
      status.append(
        h(
          'p',
          { class: 'travel-line' },
          icon('pin', { size: 16 }),
          ' ',
          cur.destination ? placeName(cur.destination) : t('travel.noDestination'),
        ),
      );
      for (const line of c.stayLines()) status.append(h('p', { class: 'travel-line', text: line }));
      status.append(
        h('button', {
          type: 'button',
          class: 'btn btn-sm',
          text: t('travel.changeTrip'),
          onclick: () => c.openStartSheet(),
        }),
      );
    } else {
      status.append(h('p', { class: 'hint', text: t('travel.notTravelling') }));
    }
    el.append(status);

    // Rulings in effect
    const madhab = t(`opt.travel.madhab.${r.madhab}`);
    const lang = currentLanguage();
    el.append(
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'travel-rules' },
        h('h2', { id: 'travel-rules', text: t('travel.rulesTitle', { madhab }) }),
        h(
          'ul',
          { class: 'travel-rules' },
          rulesSummary(r, v['travel.units']).map((line) => h('li', { text: line })),
        ),
        r.sources.length
          ? h(
              'details',
              { class: 'travel-sources' },
              h('summary', { text: t('travel.sources') }),
              h(
                'ul',
                null,
                r.sources.map((s) => h('li', { text: s[lang] ?? s.en })),
              ),
            )
          : null,
        h('a', {
          class: 'btn btn-ghost btn-sm',
          href: '#settings/travel',
          text: t('travel.settingsLink'),
        }),
      ),
    );

    // Home
    const home = c.home();
    const here = c.here();
    const d = distanceFromHome(home, here, r);
    el.append(
      h(
        'section',
        { class: 'card', 'aria-labelledby': 'travel-home' },
        h('h2', { id: 'travel-home', text: t('travel.home') }),
        h(
          'div',
          { class: 'loc-summary' },
          icon('pin'),
          h(
            'div',
            { class: 'grow' },
            h('strong', { text: home ? placeName(home) : t('loc.none') }),
            d
              ? h('span', {
                  class: 'hint',
                  text: t('travel.distanceFromHome', {
                    distance: fmtDistance(d.km, v['travel.units']),
                  }),
                })
              : null,
          ),
        ),
        c.homeButtons(),
      ),
    );

    for (const fn of ctx.hooks.travelSections) fn(el);
  }

  ctx.travelStore.subscribe(() => {
    // Sub-pages with their own form state (the flight page) opt out.
    if (ctx.hooks.travelSubviews[sub]?.keepOnStoreChange) return;
    if (el.isConnected) render();
    else ctx.markDirty?.('travel');
  });

  return {
    el,
    render,
    onShow(s = '', r = []) {
      if (s !== sub || r.join('/') !== rest.join('/')) {
        sub = s;
        rest = r;
        render();
        window.scrollTo(0, 0);
      }
    },
    title: () => t('travel.title'),
  };
}

/** Settings → Travel: home location, link to the Travel screen and the disclaimer. */
export function travelSettingsWidget(ctx) {
  const box = h('div');
  const render = () => {
    clear(box);
    const home = ctx.travel.home();
    box.append(
      disclaimer(),
      h(
        'div',
        { class: 'loc-summary' },
        icon('pin'),
        h(
          'div',
          { class: 'grow' },
          h('strong', { text: t('travel.home') }),
          h('span', { class: 'hint', text: home ? placeName(home) : t('loc.none') }),
        ),
      ),
      ctx.travel.homeButtons(),
      h('a', { class: 'btn btn-ghost', href: '#travel', text: t('travel.open') }),
    );
  };
  render();
  ctx.onSettings(box, (keys) => keys.some((k) => k.startsWith('home.')) && render());
  return box;
}
