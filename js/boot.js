// Runs before first paint (classic script in <head>) to apply the saved
// theme, accent, text size and language direction without a flash.
// Values are re-validated properly by js/settings.js once the app loads.
(function () {
  var root = document.documentElement;
  var v;
  try {
    var stored = JSON.parse(localStorage.getItem('iman.settings') || 'null');
    v = (stored && stored.values) || {};
  } catch (e) {
    v = {};
  }
  var pick = function (value, allowed) {
    return allowed.indexOf(value) >= 0 ? value : null;
  };
  var theme = pick(v['appearance.theme'], ['dark', 'light']);
  if (theme) root.setAttribute('data-theme', theme);
  var accent = pick(v['appearance.accent'], ['emerald', 'sky', 'rose', 'lavender']);
  if (accent) root.setAttribute('data-accent', accent);
  var font = pick(v['appearance.fontSize'], ['small', 'large']);
  if (font) root.setAttribute('data-font', font);
  // Exact language handling happens in js/i18n; this only avoids a layout flip.
  var lang = /^[a-z]{2,3}$/.test(v['appearance.language']) ? v['appearance.language'] : null;
  if (!lang) {
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    lang = nav.toLowerCase().split('-')[0];
  }
  root.lang = lang;
  root.dir = ['ar', 'fa', 'he', 'ur', 'ps', 'ckb', 'yi', 'dv'].indexOf(lang) >= 0 ? 'rtl' : 'ltr';
})();
