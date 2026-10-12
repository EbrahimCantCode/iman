// Settings screen, generated from js/config/schema.js.
// Sections are collapsible <details>; a search box filters every control.
// Changes apply immediately (no Save button) with a small "Saved" toast.

import { h, clear, nextId, toast, confirmDialog } from '../ui.js';
import { t, has } from '../i18n/index.js';
import { SCHEMA, SECTIONS } from '../config/schema.js';
import { PRAYERS } from '../config/constants.js';
import { normalizeSearch } from '../location.js';
import { VERSION, REPO_URL } from '../version.js';

/**
 * @param {object} ctx app context
 * @param {Record<string, (ctx) => Node>} widgets custom UI shown at the top of a section
 */
export function createSettingsView(ctx, widgets = {}) {
  const el = h('section', { class: 'view view-settings', 'aria-labelledby': 'settings-title' });
  const controls = new Map(); // key -> { def, row, sync(value) }
  const sections = new Map(); // section -> { details, rows: [{row, text}], custom }
  let query = '';
  let savedTimer;

  ctx.settings.subscribe((keys, values) => {
    if (!controls.size) return;
    for (const k of keys) controls.get(k)?.sync(values[k]);
    applyVisibility(values);
  });

  const label = (def) => t(def.label);
  const help = (def) => (def.help && has(def.help) ? t(def.help) : null);
  const optionLabel = (def, opt) => {
    const custom = ctx.hooks.optionLabel?.(def, opt);
    if (custom) return custom;
    const key = `opt.${def.optionsKey}.${opt}`;
    return has(key) ? t(key) : String(opt);
  };
  const groupLabel = (g) => (PRAYERS.includes(g) ? t(`prayer.${g}`) : t(`group.${g}`));

  function saved() {
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => toast(t('settings.saved'), { duration: 1200 }), 150);
  }

  function change(key, value) {
    ctx.settings.set(key, value);
    // Re-sync in case the value was clamped or rejected.
    controls.get(key)?.sync(ctx.settings.get(key));
    saved();
  }

  // ------------------------------------------------------------ controls

  function textBlock(def, forId, helpId) {
    const text = help(def);
    return h(
      'label',
      { class: 'set-row-text', for: forId },
      h('span', { class: 'set-row-label', text: label(def) }),
      text ? h('span', { class: 'set-row-help', id: helpId, text }) : null,
    );
  }

  function booleanRow(def, value) {
    const id = nextId('set');
    const helpId = nextId('help');
    const input = h('input', {
      type: 'checkbox',
      role: 'switch',
      class: 'switch',
      id,
      checked: value,
      'aria-describedby': help(def) ? helpId : null,
      onchange: () => change(def.key, input.checked),
    });
    const row = h('div', { class: 'set-row' }, textBlock(def, id, helpId), input);
    return { row, sync: (v) => (input.checked = v) };
  }

  function numberRow(def, value) {
    const id = nextId('set');
    const helpId = nextId('help');
    const input = h('input', {
      type: 'number',
      id,
      min: def.min,
      max: def.max,
      step: def.step,
      inputmode: def.step < 1 || def.min < 0 ? 'decimal' : 'numeric',
      'aria-describedby': help(def) ? helpId : null,
      onchange: () => change(def.key, input.value),
    });
    let current = value;
    const step = (dir) => {
      const decimals = String(def.step).split('.')[1]?.length ?? 0;
      change(def.key, Number((current + dir * def.step).toFixed(decimals)));
    };
    const dec = h('button', {
      type: 'button',
      text: '−',
      'aria-label': t('common.decrease', { label: label(def) }),
      onclick: () => step(-1),
    });
    const inc = h('button', {
      type: 'button',
      text: '+',
      'aria-label': t('common.increase', { label: label(def) }),
      onclick: () => step(1),
    });
    const unit = def.unit
      ? h('span', { class: 'unit', 'aria-hidden': 'true', text: t(`unit.${def.unit}`) })
      : null;
    const row = h(
      'div',
      { class: 'set-row' },
      textBlock(def, id, helpId),
      h('div', { class: 'stepper' }, dec, input, unit, inc),
    );
    const sync = (v) => {
      current = v;
      input.value = String(v);
      dec.disabled = v <= def.min;
      inc.disabled = v >= def.max;
    };
    sync(value);
    return { row, sync };
  }

  function selectRow(def, value) {
    const id = nextId('set');
    const helpId = nextId('help');
    const select = h(
      'select',
      {
        id,
        class: 'input',
        'aria-describedby': help(def) ? helpId : null,
        onchange: () => change(def.key, select.value),
      },
      def.options.map((o) => h('option', { value: o, text: optionLabel(def, o) })),
    );
    select.value = value;
    const long = def.options.some((o) => optionLabel(def, o).length > 22);
    const row = h(
      'div',
      { class: ['set-row', long && 'stack'] },
      textBlock(def, id, helpId),
      select,
    );
    return {
      row,
      sync: (v) => {
        // Option labels can depend on other settings (e.g. the suggested method).
        for (const opt of select.options) opt.textContent = optionLabel(def, opt.value);
        select.value = v;
      },
    };
  }

  function multiRow(def, value) {
    const helpText = help(def);
    const boxes = def.options.map((o) => {
      const input = h('input', {
        type: 'checkbox',
        value: o,
        checked: value.includes(o),
        onchange: () => {
          const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
          change(def.key, chosen);
        },
      });
      return input;
    });
    const legendId = nextId('legend');
    const row = h(
      'fieldset',
      { class: 'set-row stack', 'aria-labelledby': legendId },
      h(
        'div',
        { class: 'set-row-text' },
        h('span', { class: 'set-row-label', id: legendId, text: label(def) }),
        helpText ? h('span', { class: 'set-row-help', text: helpText }) : null,
      ),
      h(
        'div',
        { class: 'chips' },
        boxes.map((b) =>
          h('label', { class: 'chip' }, b, h('span', { text: optionLabel(def, b.value) })),
        ),
      ),
    );
    return {
      row,
      sync: (v) => {
        for (const b of boxes) b.checked = v.includes(b.value);
      },
    };
  }

  function timeRow(def, value) {
    const id = nextId('set');
    const input = h('input', {
      type: 'time',
      id,
      class: 'input',
      value,
      onchange: () => input.value && change(def.key, input.value),
    });
    const row = h('div', { class: 'set-row' }, textBlock(def, id, nextId('help')), input);
    return { row, sync: (v) => (input.value = v) };
  }

  function textRow(def, value) {
    const id = nextId('set');
    const helpId = nextId('help');
    const props = {
      id,
      class: 'input',
      maxlength: def.maxLength,
      placeholder: ctx.hooks.placeholder?.(def) ?? '',
      'aria-describedby': help(def) ? helpId : null,
      onchange: () => change(def.key, input.value),
    };
    const input = def.multiline
      ? h('textarea', { ...props, rows: 3 })
      : h('input', { ...props, type: 'text' });
    input.value = value;
    const row = h('div', { class: 'set-row stack' }, textBlock(def, id, helpId), input);
    return { row, sync: (v) => (input.value = v) };
  }

  const BUILDERS = {
    boolean: booleanRow,
    number: numberRow,
    select: selectRow,
    multiselect: multiRow,
    time: timeRow,
    text: textRow,
  };

  // ------------------------------------------------------------ render

  function render() {
    clear(el);
    controls.clear();
    sections.clear();
    const values = ctx.values();

    el.append(h('h1', { id: 'settings-title', class: 'view-title', text: t('settings.title') }));

    const search = h('input', {
      type: 'search',
      class: 'input',
      placeholder: t('settings.search'),
      'aria-label': t('settings.search'),
      enterkeyhint: 'search',
      value: query,
      oninput: () => {
        query = search.value;
        applyVisibility(ctx.values());
      },
    });
    el.append(h('div', { class: 'settings-search', role: 'search' }, search));
    const empty = h('p', { class: 'hint', hidden: true, id: 'settings-empty' });
    el.append(empty);

    for (const section of SECTIONS) {
      const defs = SCHEMA.filter((d) => d.section === section && !d.hidden);
      const custom = widgets[section]?.(ctx) ?? null;
      if (!defs.length && !custom) continue;

      const body = h('div', { class: 'set-section-body' });
      const title = t(`section.${section}`);
      const details = h(
        'details',
        { class: 'set-section', id: `set-${section}` },
        h('summary', { text: title }),
        body,
      );
      const info = { details, rows: [], custom, title, groups: [] };
      if (custom) body.append(h('div', { class: 'set-custom' }, custom));

      let group = null;
      let groupEl = null;
      for (const def of defs) {
        if (def.group !== group) {
          group = def.group ?? null;
          if (group) {
            const gHelp = has(`group.${group}.help`) ? t(`group.${group}.help`) : null;
            groupEl = h(
              'div',
              { class: 'set-group' },
              h('h3', { class: 'set-group-title', text: groupLabel(group) }),
              gHelp ? h('p', { class: 'set-row-help', text: gHelp }) : null,
            );
            body.append(groupEl);
            info.groups.push({ el: groupEl, rows: [] });
          } else {
            groupEl = null;
          }
        }
        const { row, sync } = BUILDERS[def.type](def, values[def.key]);
        row.dataset.key = def.key;
        controls.set(def.key, { def, row, sync });
        const text = normalizeSearch(
          [label(def), help(def) ?? '', group ? groupLabel(group) : '', title].join(' '),
        );
        info.rows.push({ row, text, def });
        if (groupEl) {
          groupEl.append(row);
          info.groups.at(-1).rows.push(row);
        } else body.append(row);
      }

      if (defs.length) {
        body.append(
          h(
            'div',
            { class: 'set-actions' },
            h('button', {
              type: 'button',
              class: 'btn btn-ghost',
              text: t('settings.resetSection'),
              onclick: async () => {
                const ok = await confirmDialog({
                  title: t('settings.resetSection'),
                  body: t('settings.resetSectionConfirm', { section: title }),
                });
                if (ok) {
                  ctx.settings.resetSection(section);
                  toast(t('settings.resetDone'));
                }
              },
            }),
          ),
        );
      }
      sections.set(section, info);
      el.append(details);
    }

    el.append(footer());
    applyVisibility(values);
  }

  function footer() {
    return h(
      'div',
      { class: 'settings-footer' },
      h('button', {
        type: 'button',
        class: 'btn',
        text: t('settings.resetAll'),
        onclick: async () => {
          const ok = await confirmDialog({
            title: t('settings.resetAll'),
            body: t('settings.resetAllConfirm'),
            danger: true,
          });
          if (ok) {
            ctx.settings.resetAll();
            toast(t('settings.resetDone'));
          }
        },
      }),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        text: t('settings.runSetup'),
        onclick: () => ctx.hooks.runOnboarding?.(),
      }),
      h('a', { class: 'btn btn-ghost', href: '#guide', text: t('settings.guide') }),
      h(
        'p',
        { class: 'hint' },
        `Iman ${VERSION} · `,
        h('a', { href: REPO_URL, rel: 'noopener', target: '_blank', text: t('settings.source') }),
        ' · ',
        h('a', { href: 'THIRD_PARTY_LICENSES.md', target: '_blank', text: t('settings.licenses') }),
      ),
    );
  }

  function applyVisibility(values) {
    const q = normalizeSearch(query);
    let anyMatch = false;
    for (const [, info] of sections) {
      const titleMatch = q && normalizeSearch(info.title).includes(q);
      let sectionMatch = !q || titleMatch;
      for (const { row, text, def } of info.rows) {
        const shown = !def.showIf || def.showIf(values);
        const matches = !q || titleMatch || text.includes(q);
        row.hidden = !(shown && matches);
        if (q && matches && shown) sectionMatch = true;
      }
      for (const g of info.groups) g.el.hidden = g.rows.every((r) => r.hidden);
      if (info.custom) info.custom.parentElement.hidden = Boolean(q && !titleMatch);
      info.details.hidden = !sectionMatch;
      if (q && sectionMatch) info.details.open = true;
      anyMatch ||= sectionMatch;
    }
    const empty = el.querySelector('#settings-empty');
    if (empty) {
      empty.hidden = !q || anyMatch;
      empty.textContent = t('settings.noResults', { q: query });
    }
  }

  /** Open (and scroll to) a section, e.g. from "#settings/prayer". */
  function onShow(sub) {
    if (!sub) return;
    const info = sections.get(sub);
    if (!info) return;
    info.details.open = true;
    requestAnimationFrame(() => info.details.scrollIntoView({ block: 'start' }));
  }

  return { el, render, onShow, title: () => t('tab.settings'), keepOnChange: true };
}
