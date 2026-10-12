// Small DOM helpers. Elements are built with createElement/textContent only,
// never innerHTML, so user-provided text can't inject markup.

import { t } from './i18n/index.js';

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'indeterminate']);

/**
 * Create an element. `props` may contain: class, text, dataset, style (object),
 * on<Event> handlers, boolean properties and plain attributes.
 */
export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, attrs = null, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function setProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

let uid = 0;
/** A unique element id with a readable prefix. */
export const nextId = (prefix = 'id') => `${prefix}-${++uid}`;

// ---------------------------------------------------------------- toast

let toastTimer;
/** Show a short message at the bottom of the screen (announced to screen readers). */
export function toast(message, { action, onAction, duration = 2200 } = {}) {
  let box = document.getElementById('toast');
  if (!box) {
    box = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  clear(box);
  box.append(h('span', { text: message }));
  if (action) {
    box.append(
      h('button', {
        class: 'toast-action',
        type: 'button',
        text: action,
        onclick: () => {
          box.classList.remove('show');
          onAction?.();
        },
      }),
    );
  }
  box.classList.add('show');
  clearTimeout(toastTimer);
  if (duration > 0) toastTimer = setTimeout(() => box.classList.remove('show'), duration);
}

// ---------------------------------------------------------------- dialogs

/**
 * Open a modal <dialog>. Returns { el, body, close }. Escape and the close
 * button always work, so the user is never trapped.
 */
export function openDialog({ title, content, actions = [], className = '', onClose, labelledBy }) {
  const titleId = nextId('dlg-title');
  const body = h('div', { class: 'dialog-body' }, content);
  const dlg = h(
    'dialog',
    { class: ['dialog', className], 'aria-labelledby': labelledBy ?? titleId },
    h(
      'div',
      { class: 'dialog-head' },
      title ? h('h2', { id: titleId, class: 'dialog-title', text: title }) : null,
      h(
        'button',
        {
          type: 'button',
          class: 'icon-btn dialog-x',
          'aria-label': t('common.close'),
          onclick: () => close(),
        },
        '×',
      ),
    ),
    body,
    actions.length ? h('div', { class: 'dialog-actions' }, actions) : null,
  );
  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    onClose?.(result);
  }
  dlg.addEventListener('close', () => close());
  document.body.append(dlg);
  dlg.showModal();
  return { el: dlg, body, close };
}

/**
 * Ask for confirmation. With `typed`, the user must type that word first
 * (used for "Delete all data").
 */
export function confirmDialog({
  title,
  body,
  confirmLabel = t('common.ok'),
  danger = false,
  typed,
}) {
  return new Promise((resolve) => {
    let result = false;
    const input = typed
      ? h('input', {
          type: 'text',
          class: 'input',
          autocomplete: 'off',
          autocapitalize: 'characters',
          spellcheck: 'false',
          'aria-label': typed,
          oninput: () => (ok.disabled = input.value.trim().toUpperCase() !== typed.toUpperCase()),
        })
      : null;
    const ok = h('button', {
      type: 'button',
      class: ['btn', danger ? 'btn-danger' : 'btn-primary'],
      text: confirmLabel,
      disabled: Boolean(typed),
      onclick: () => {
        result = true;
        dlg.close();
      },
    });
    const cancel = h('button', {
      type: 'button',
      class: 'btn',
      text: t('common.cancel'),
      onclick: () => dlg.close(),
    });
    const dlg = openDialog({
      title,
      content: [h('p', { text: body }), input],
      actions: [cancel, ok],
      onClose: () => resolve(result),
    });
    (input ?? cancel).focus();
  });
}

// ---------------------------------------------------------------- files

/** Save JSON as a file (share sheet on phones when available, else a download). */
export async function saveJSON(filename, data) {
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const coarse = globalThis.matchMedia?.('(pointer: coarse)').matches;
  if (coarse && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return true;
      } catch (err) {
        if (err?.name === 'AbortError') return false;
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Let the user pick a file. Resolves to a File or null. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS: fall back to a temporary textarea.
    const ta = h('textarea', { class: 'visually-hidden', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

// ---------------------------------------------------------------- long press

/**
 * Press-and-hold behaviour for an element (pointer + keyboard). Calls
 * onProgress(0..1) while held and onDone() after `ms`.
 */
export function longPress(el, ms, onDone, onProgress = () => {}) {
  let start = 0;
  let raf = 0;
  let timer = 0;
  // Completion uses a timer (rAF pauses when the page isn't painting);
  // animation frames only drive the progress indicator.
  const tick = () => {
    onProgress(Math.min(1, (performance.now() - start) / ms));
    raf = requestAnimationFrame(tick);
  };
  const begin = (e) => {
    if (timer) return;
    e.preventDefault();
    start = performance.now();
    timer = setTimeout(() => {
      stop(false);
      onProgress(1);
      onDone();
    }, ms);
    raf = requestAnimationFrame(tick);
  };
  const stop = (reset = true) => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    timer = 0;
    raf = 0;
    if (reset) onProgress(0);
  };
  el.addEventListener('pointerdown', begin);
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'])
    el.addEventListener(ev, () => stop());
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) begin(e);
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') stop();
  });
}

/** True when running as an installed app (Home Screen / standalone window). */
export function isStandalone() {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches ||
    globalThis.navigator?.standalone === true
  );
}

/** iPhone / iPad (including iPadOS reporting as Mac). */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
