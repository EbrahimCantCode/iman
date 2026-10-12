// Custom blocks shown at the top of Settings sections (things that are
// actions rather than plain settings). Feature modules add more via ctx.hooks.

import { h, clear, toast, confirmDialog, saveJSON, pickFile } from '../ui.js';
import { icon } from '../icons.js';
import { t, countryName, fmtNum } from '../i18n/index.js';
import { suggestMethod, resolveMethod } from '../config/methods.js';
import { STORAGE_KEYS } from '../config/constants.js';
import { removeKey } from '../storage.js';
import { now, isDebugTime } from '../clock.js';

export function createWidgets(ctx) {
  // "Suggested for your location (Kuwait)" in the method menu.
  ctx.hooks.optionLabel = (def, opt) => {
    if (def.key === 'prayer.method' && opt === 'auto') {
      const loc = ctx.location();
      if (!loc) return null;
      return `${t('opt.method.auto')}: ${t(`opt.method.${suggestMethod(loc.country)}`)}`;
    }
    return null;
  };

  return {
    location: locationWidget,
    prayer: prayerWidget,
    data: dataWidget,
    advanced: advancedWidget,
    ...ctx.hooks.sectionWidgets,
  };

  function locationWidget() {
    const box = h('div');
    const render = () => {
      clear(box);
      const loc = ctx.location();
      const v = ctx.values();
      const f = (n) => fmtNum(n, { maximumFractionDigits: 4 });
      box.append(
        h(
          'div',
          { class: 'loc-summary' },
          icon('pin'),
          h(
            'div',
            { class: 'grow' },
            h('strong', { text: ctx.locationName(loc) }),
            loc
              ? h('span', {
                  class: 'hint',
                  text: [
                    t(`loc.mode.${v['location.mode']}`),
                    `${f(loc.lat)}, ${f(loc.lon)}`,
                    loc.country ? countryName(loc.country) : '',
                    loc.tz,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                })
              : null,
          ),
        ),
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn btn-primary',
            text: loc ? t('today.changeLocation') : t('today.setLocation'),
            onclick: () => ctx.openLocationPicker(),
          }),
        ),
      );
    };
    render();
    ctx.onSettings(box, (keys) => keys.some((k) => k.startsWith('location.')) && render());
    return box;
  }

  function prayerWidget() {
    const box = h('p', { class: 'hint' });
    const render = () => {
      const loc = ctx.location();
      const v = ctx.values();
      if (!loc) {
        box.textContent = t('onb.method.noLocation');
        return;
      }
      const inUse = resolveMethod(v['prayer.method'], loc.country);
      box.textContent = t('prayer.methodInUse', {
        method: t(`opt.method.${inUse}`),
        suggested: t(`opt.method.${suggestMethod(loc.country)}`),
        place: loc.country ? countryName(loc.country) : ctx.locationName(loc),
      });
    };
    render();
    ctx.onSettings(box, render);
    return box;
  }

  function dataWidget() {
    const exportSettings = (share) => {
      const data = ctx.settings.exportData({ share });
      saveJSON(share ? 'iman-setup.json' : `iman-settings-${stamp()}.json`, data);
    };
    const exportBackup = () => {
      const data = {
        app: 'iman',
        kind: 'backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: ctx.settings.exportData(),
        tracker: ctx.hooks.trackerExport?.() ?? null,
      };
      saveJSON(`iman-backup-${stamp()}.json`, data);
    };
    const importFile = async () => {
      const file = await pickFile('application/json,.json');
      if (!file) return;
      if (file.size > 5_000_000) {
        toast(t('data.importError.tooLarge'));
        return;
      }
      const text = await file.text();
      let kind;
      try {
        kind = JSON.parse(text)?.kind;
      } catch {
        toast(t('data.importError.invalidJson'));
        return;
      }
      let settingsCount = 0;
      let ignored = 0;
      let days = 0;
      if (kind === 'settings' || kind === 'backup') {
        const res = ctx.settings.importData(text);
        if (!res.ok) {
          toast(t(`data.importError.${res.error}`));
          return;
        }
        settingsCount = Object.keys(res.values).length;
        ignored += res.ignored.length;
      }
      if (kind === 'tracker' || kind === 'backup') {
        const res = ctx.hooks.trackerImport?.(text);
        if (res && !res.ok && kind === 'tracker') {
          toast(t(`data.importError.${res.error}`));
          return;
        }
        if (res?.ok) {
          days = res.days;
          ignored += res.ignored;
        }
      }
      if (!['settings', 'backup', 'tracker'].includes(kind)) {
        toast(t('data.importError.notIman'));
        return;
      }
      toast(
        t('data.imported', { n: settingsCount, d: days }) +
          (ignored ? ` ${t('data.importIgnored', { n: ignored })}` : ''),
        { duration: 4000 },
      );
    };
    const deleteAll = async () => {
      const word = t('data.deleteWord');
      const ok = await confirmDialog({
        title: t('data.delete'),
        body: t('data.deleteConfirm', { word }),
        confirmLabel: t('data.delete'),
        danger: true,
        typed: word,
      });
      if (!ok) return;
      for (const key of Object.values(STORAGE_KEYS)) removeKey(ctx.storage, key);
      await ctx.hooks.deleteFiles?.();
      try {
        indexedDB.deleteDatabase('iman');
      } catch {
        /* ignore */
      }
      toast(t('data.deleted'));
      setTimeout(() => location.replace(location.pathname), 600);
    };

    return h(
      'div',
      null,
      h('p', { class: 'hint', text: t('data.privacy') }),
      ctx.storage.persistent === false
        ? h('p', { class: 'banner', text: t('data.storageTemporary') })
        : null,
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          { type: 'button', class: 'btn', onclick: exportBackup },
          icon('download'),
          t('data.exportAll'),
        ),
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => exportSettings(false) },
          icon('download'),
          t('data.exportSettings'),
        ),
        ctx.hooks.trackerExport
          ? h(
              'button',
              {
                type: 'button',
                class: 'btn',
                onclick: () => saveJSON(`iman-tracker-${stamp()}.json`, ctx.hooks.trackerExport()),
              },
              icon('download'),
              t('data.exportTracker'),
            )
          : null,
        h(
          'button',
          { type: 'button', class: 'btn', onclick: importFile },
          icon('upload'),
          t('data.import'),
        ),
      ),
      h(
        'div',
        { class: 'card-row' },
        h(
          'div',
          { class: 'grow' },
          h('strong', { text: t('data.shareSetup') }),
          h('p', { class: 'hint', text: t('data.shareHelp') }),
        ),
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => exportSettings(true) },
          icon('share'),
          t('data.share'),
        ),
      ),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          { type: 'button', class: 'btn btn-danger', onclick: deleteAll },
          icon('trash'),
          t('data.delete'),
        ),
      ),
    );
  }

  function advancedWidget() {
    const box = h('div');
    const render = () => {
      clear(box);
      if (!ctx.values()['advanced.devMode']) return;
      const input = h('input', {
        type: 'datetime-local',
        step: 1,
        class: 'input',
        id: 'debug-time',
        value: toLocalInput(now()),
      });
      const go = (value) => {
        const url = new URL(location.href);
        if (value) url.searchParams.set('debugTime', value);
        else url.searchParams.delete('debugTime');
        url.hash = '#settings/advanced';
        location.assign(url.toString());
      };
      box.append(
        h(
          'div',
          { class: 'field' },
          h('label', { for: 'debug-time', text: t('adv.debugTime') }),
          input,
        ),
        h('p', { class: 'hint', text: t('adv.debugHelp') }),
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn',
            text: t('adv.apply'),
            onclick: () => go(input.value),
          }),
          isDebugTime()
            ? h('button', {
                type: 'button',
                class: 'btn btn-ghost',
                text: t('adv.clear'),
                onclick: () => go(''),
              })
            : null,
        ),
        ctx.hooks.devTools?.() ?? null,
      );
    };
    render();
    ctx.onSettings(box, (keys) => keys.includes('advanced.devMode') && render());
    return box;
  }
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
