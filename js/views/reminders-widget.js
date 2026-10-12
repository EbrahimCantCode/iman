// "Reminders and adhan" section header: permission status, honest notes
// about closed-app alerts, test buttons and the user's adhan audio files.

import { h, clear, toast, pickFile } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n/index.js';
import { notificationSupport, supportsTriggers } from '../notify.js';
import { playSound, audioFileName, saveAudioFile, removeAudioFile, stopSound } from '../audio.js';

export function remindersWidget(ctx, notifier) {
  const box = h('div');

  async function render() {
    clear(box);
    const values = ctx.values();
    const support = notificationSupport();
    let status;
    if (support === 'ios-install') status = t('notify.iosInstall');
    else if (support === 'unsupported') status = t('notify.unsupported');
    else if (support === 'denied') status = t('notify.blocked');
    else if (values['reminders.enabled'] && support === 'granted') status = t('notify.on');
    else status = t('notify.off');

    box.append(
      ...[
        h(
          'div',
          { class: 'loc-summary' },
          icon('bell'),
          h('p', { class: 'grow', role: 'status', text: status }),
        ),
        h('p', { class: 'hint', text: t('notify.closedApp') }),
        supportsTriggers() ? h('p', { class: 'hint', text: t('notify.triggers') }) : null,
        h(
          'div',
          { class: 'btn-row' },
          h('button', {
            type: 'button',
            class: 'btn',
            text: t('notify.test'),
            disabled: support !== 'granted',
            onclick: () => notifier.test(),
          }),
          h('button', {
            type: 'button',
            class: 'btn',
            text: t('audio.testAdhan'),
            onclick: async () => {
              const played = await playSound('adhan', values['reminders.volume'] / 100);
              if (played === 'adhan')
                toast(t('audio.playing'), {
                  action: t('notify.stopAdhan'),
                  onAction: stopSound,
                  duration: 10000,
                });
              else toast(t('audio.noAdhan'));
            },
          }),
          h('button', {
            type: 'button',
            class: 'btn',
            text: t('audio.testChime'),
            onclick: () => playSound('chime', values['reminders.volume'] / 100),
          }),
        ),
      ].filter(Boolean),
    );

    const files = h('div', { class: 'audio-files' });
    for (const kind of ['adhan', 'adhan-fajr']) {
      const name = await audioFileName(kind);
      files.append(
        h(
          'div',
          { class: 'card-row audio-row' },
          h(
            'div',
            { class: 'grow' },
            h('strong', { text: t(`audio.${kind}`) }),
            h('p', {
              class: 'hint',
              text: name ?? t(kind === 'adhan' ? 'audio.none' : 'audio.noneFajr'),
            }),
          ),
          h('button', {
            type: 'button',
            class: 'btn',
            text: name ? t('audio.replace') : t('audio.add'),
            onclick: async () => {
              const file = await pickFile('audio/*');
              if (!file) return;
              try {
                await saveAudioFile(kind, file);
                toast(t('audio.saved', { name: file.name }));
              } catch (err) {
                toast(
                  t(
                    err.code === 'tooLarge'
                      ? 'audio.tooLarge'
                      : err.code === 'notAudio'
                        ? 'audio.notAudio'
                        : 'common.error',
                  ),
                );
              }
              render();
            },
          }),
          name
            ? h('button', {
                type: 'button',
                class: 'btn btn-ghost',
                text: t('common.remove'),
                onclick: async () => {
                  await removeAudioFile(kind).catch(() => {});
                  render();
                },
              })
            : null,
        ),
      );
    }
    box.append(
      h('h3', { class: 'set-group-title', text: t('audio.files') }),
      h('p', { class: 'hint', text: t('audio.filesHelp') }),
      files,
    );
  }

  render();
  ctx.onSettings(box, (keys) => {
    if (keys.some((k) => k === 'reminders.enabled' || k === 'reminders.volume')) render();
  });
  return box;
}
