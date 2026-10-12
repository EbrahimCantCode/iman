// First-run onboarding: language -> location -> calculation method ->
// notifications. Every step can be skipped; it can be reopened from Settings.

import { h, add, clear, openDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t, countryName } from '../i18n/index.js';
import { SCHEMA_BY_KEY } from '../config/schema.js';
import { suggestMethod } from '../config/methods.js';

const STEPS = ['welcome', 'location', 'method', 'notify'];

export function shouldOnboard(ctx) {
  return !ctx.state.get('onboarded') && !ctx.location();
}

export function runOnboarding(ctx) {
  let step = 0;
  const body = h('div', { class: 'onb' });
  const dlg = openDialog({
    title: '',
    labelledBy: 'onb-title',
    className: 'onb-dialog',
    content: body,
    onClose: () => {
      ctx.state.set('onboarded', true);
      ctx.bus.removeEventListener('language', render);
      ctx.bus.removeEventListener('settings', onSettings);
    },
  });
  // Re-render when the location is set or notifications change, not on every
  // select change (that would steal focus from the control in use).
  const onSettings = (e) => {
    if (e.detail.some((k) => k.startsWith('location.') || k === 'reminders.enabled')) render();
  };
  ctx.bus.addEventListener('language', render);
  ctx.bus.addEventListener('settings', onSettings);

  const finish = () => {
    ctx.state.set('onboarded', true);
    dlg.close();
    ctx.navigate('#today');
  };
  const next = () => {
    if (step < STEPS.length - 1) {
      step += 1;
      render();
      body.querySelector('h2')?.focus();
    } else finish();
  };

  function select(key, id) {
    const def = SCHEMA_BY_KEY.get(key);
    const label = (o) => {
      const custom = ctx.hooks.optionLabel?.(def, o);
      return custom ?? t(def.optionLabel(o));
    };
    const el = h(
      'select',
      { id, class: 'input', onchange: () => ctx.settings.set(key, el.value) },
      def.options.map((o) => h('option', { value: o, text: label(o) })),
    );
    el.value = ctx.values()[key];
    return el;
  }

  function render() {
    if (!dlg.el.isConnected) return;
    clear(body);
    const name = STEPS[step];
    const art = { welcome: 'crescent', location: 'pin', method: 'today', notify: 'bell' }[name];
    body.append(
      h('div', { class: 'onb-art' }, icon(art)),
      h('p', { class: 'onb-step', text: t('onb.step', { i: step + 1, n: STEPS.length }) }),
    );
    const actions = h('div', { class: 'btn-row onb-actions' });

    if (name === 'welcome') {
      body.append(
        h('h2', { id: 'onb-title', tabindex: -1, text: t('onb.welcome.title') }),
        h('p', { text: t('onb.welcome.body') }),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'onb-lang', text: t('onb.language') }),
          select('appearance.language', 'onb-lang'),
        ),
      );
      actions.append(primary(t('common.next'), next));
    }

    if (name === 'location') {
      const loc = ctx.location();
      body.append(
        h('h2', { id: 'onb-title', tabindex: -1, text: t('onb.location.title') }),
        h('p', { text: t('onb.location.body') }),
      );
      if (loc) {
        body.append(
          h(
            'div',
            { class: 'loc-summary' },
            icon('pin'),
            h('strong', { class: 'grow', text: ctx.locationName(loc) }),
          ),
        );
      }
      body.append(
        h(
          'div',
          { class: 'onb-choices' },
          h('button', {
            type: 'button',
            class: ['btn btn-block', !loc && 'btn-primary'],
            text: t('loc.gps'),
            onclick: () => ctx.openLocationPicker({ tab: 'gps' }),
          }),
          h('button', {
            type: 'button',
            class: 'btn btn-block',
            text: t('loc.city'),
            onclick: () => ctx.openLocationPicker({ tab: 'city' }),
          }),
          h('button', {
            type: 'button',
            class: 'btn btn-block btn-ghost',
            text: t('loc.manual'),
            onclick: () => ctx.openLocationPicker({ tab: 'manual' }),
          }),
        ),
      );
      if (loc) actions.append(primary(t('common.next'), next));
      else
        actions.append(
          h('button', {
            type: 'button',
            class: 'btn btn-ghost',
            text: t('common.skip'),
            onclick: next,
          }),
        );
    }

    if (name === 'method') {
      const loc = ctx.location();
      body.append(
        h('h2', { id: 'onb-title', tabindex: -1, text: t('onb.method.title') }),
        h('p', {
          text: loc
            ? t('onb.method.body', {
                place: loc.country ? countryName(loc.country) : ctx.locationName(loc),
                method: t(`opt.method.${suggestMethod(loc.country)}`),
              })
            : t('onb.method.noLocation'),
        }),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'onb-method', text: t('set.prayer.method') }),
          select('prayer.method', 'onb-method'),
        ),
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'onb-madhab', text: t('set.prayer.madhab') }),
          select('prayer.madhab', 'onb-madhab'),
        ),
      );
      actions.append(primary(t('common.next'), next));
    }

    if (name === 'notify') {
      const on =
        ctx.values()['reminders.enabled'] && globalThis.Notification?.permission === 'granted';
      add(
        body,
        h('h2', { id: 'onb-title', tabindex: -1, text: t('onb.notify.title') }),
        h('p', { text: t('onb.notify.body') }),
        ctx.hooks.notifyNote?.() ?? null,
      );
      if (on) {
        body.append(h('p', { class: 'hint', role: 'status', text: t('onb.notify.enabled') }));
        actions.append(primary(t('onb.finish'), finish));
      } else {
        actions.append(
          h('button', {
            type: 'button',
            class: 'btn btn-ghost',
            text: t('onb.notify.later'),
            onclick: finish,
          }),
          primary(t('onb.notify.enable'), async () => {
            await ctx.hooks.enableNotifications?.();
            render();
          }),
        );
      }
    }

    body.append(actions);
    if (name !== 'notify') {
      body.append(
        h('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: t('onb.skip'),
          onclick: finish,
        }),
      );
    }
    body.append(
      h(
        'div',
        { class: 'onb-dots', 'aria-hidden': 'true' },
        STEPS.map((_, i) => h('span', { class: i === step ? 'on' : '' })),
      ),
    );
  }

  render();
  body.querySelector('h2')?.focus();
  return dlg;
}

function primary(text, onclick) {
  return h('button', { type: 'button', class: 'btn btn-primary', text, onclick });
}
