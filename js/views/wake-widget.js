// "Wake check (Fajr)" section header in Settings, and the Today shortcut.

import { h, clear, toast, copyText, pickFile } from '../ui.js';
import { icon } from '../icons.js';
import { t, currentLanguage } from '../i18n/index.js';
import { buildWakeLink } from '../wake-params.js';
import { audioFileName, saveAudioFile, removeAudioFile } from '../audio.js';

export function wakeLink(ctx) {
  return buildWakeLink(
    new URL('wake.html', location.href).toString(),
    ctx.values(),
    currentLanguage(),
  );
}

export function wakeWidget(ctx) {
  const box = h('div');

  async function render() {
    clear(box);
    const v = ctx.values();
    const hasRef = Boolean(v['wake.refHist']);
    const alarmName = await audioFileName('alarm');
    box.append(
      h('p', { class: 'hint', text: t('wake.explain') }),
      h(
        'div',
        { class: 'btn-row' },
        h('a', { class: 'btn', href: 'wake.html' }, icon('alarm'), t('wake.open')),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-primary',
            onclick: async () => {
              const ok = await copyText(wakeLink(ctx));
              toast(ok ? t('wake.linkCopied') : t('common.error'));
            },
          },
          icon('copy'),
          t('wake.copyLink'),
        ),
      ),
      h('p', { class: 'hint', text: t('wake.linkHelp') }),
      h('p', { class: 'hint', text: t('wake.objectsNote') }),
      h(
        'div',
        { class: 'card-row audio-row' },
        h('p', { class: 'grow hint', text: hasRef ? t('wake.refSet') : t('wake.refNone') }),
        h('a', {
          class: 'btn',
          href: 'wake.html?register=1',
          text: hasRef ? t('wake.reRegister') : t('wake.registerRef'),
        }),
      ),
      h(
        'div',
        { class: 'card-row audio-row' },
        h(
          'div',
          { class: 'grow' },
          h('strong', { text: t('wake.alarmFile') }),
          h('p', { class: 'hint', text: alarmName ?? t('audio.none') }),
        ),
        h('button', {
          type: 'button',
          class: 'btn',
          text: alarmName ? t('audio.replace') : t('audio.add'),
          onclick: async () => {
            const file = await pickFile('audio/*');
            if (!file) return;
            try {
              await saveAudioFile('alarm', file);
              toast(t('audio.saved', { name: file.name }));
            } catch (err) {
              toast(t(err.code === 'tooLarge' ? 'audio.tooLarge' : 'audio.notAudio'));
            }
            render();
          },
        }),
        alarmName
          ? h('button', {
              type: 'button',
              class: 'btn btn-ghost',
              text: t('common.remove'),
              onclick: async () => {
                await removeAudioFile('alarm').catch(() => {});
                render();
              },
            })
          : null,
      ),
    );
  }

  render();
  ctx.onSettings(box, (keys) => keys.some((k) => k.startsWith('wake.')) && render());
  return box;
}

/** Today screen: a wake check shortcut (when enabled) and the setup guide link. */
export function todayLinks(ctx, el) {
  const links = h('div', { class: 'btn-row today-links' });
  if (ctx.values()['wake.enabled']) {
    links.append(h('a', { class: 'btn', href: 'wake.html' }, icon('alarm'), t('today.wakeCheck')));
  }
  links.append(h('a', { class: 'btn btn-ghost', href: '#guide' }, icon('phone'), t('today.guide')));
  el.append(links);
}
