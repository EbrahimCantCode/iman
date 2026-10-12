// Inline stroke icons (24×24). Original simple shapes, no icon font.

import { svg } from './ui.js';

const PATHS = {
  today: ['circle:12,12,9', 'M12 7v5l3 2'],
  qibla: ['circle:12,12,9', 'M15.5 8.5l-2 5-5 2 2-5z'],
  tracker: [
    'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
    'M4 10h16M9 3v4M15 3v4',
    'M9 15l2 2 4-4',
  ],
  settings: ['M4 7h9M17 7h3M4 17h4M12 17h8', 'circle:15,7,2', 'circle:10,17,2'],
  pin: ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z', 'circle:12,10,2.5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  late: ['M12 8v4l2.5 1.5', 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4.5 4.5v3.5H8'],
  missed: ['M7 7l10 10M17 7L7 17'],
  none: ['circle:12,12,7.5'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'],
  alarm: ['circle:12,13,7', 'M12 9.5V13l2 1.5', 'M5 4.5L3 6.5M19 4.5l2 2'],
  chevron: ['M9 6l6 6-6 6'],
  back: ['M15 6l-6 6 6 6'],
  info: ['circle:12,12,9', 'M12 11v5', 'M12 7.6v.4'],
  phone: ['M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z', 'M11 18h2'],
  download: ['M12 4v11M7 10l5 5 5-5', 'M5 20h14'],
  upload: ['M12 15V4M7 9l5-5 5 5', 'M5 20h14'],
  share: ['M12 15V4M8 8l4-4 4 4', 'M6 12v7h12v-7'],
  trash: ['M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13'],
  play: ['M8 5l11 7-11 7z'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'circle:12,13,3.5'],
  crescent: ['M15.5 4.5a8 8 0 1 0 4 12.5 6.5 6.5 0 1 1-4-12.5z'],
};

/** An icon as an inline <svg>. Decorative (aria-hidden) unless `label` is given. */
export function icon(name, { size = 24, label, className = '' } = {}) {
  const el = svg('svg', {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: `icon ${className}`.trim(),
    'aria-hidden': label ? null : 'true',
    role: label ? 'img' : null,
    'aria-label': label ?? null,
    focusable: 'false',
  });
  for (const d of PATHS[name] ?? []) {
    if (d.startsWith('circle:')) {
      const [cx, cy, r] = d.slice(7).split(',');
      el.append(svg('circle', { cx, cy, r }));
    } else {
      el.append(svg('path', { d }));
    }
  }
  return el;
}
