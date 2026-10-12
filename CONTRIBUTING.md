# Contributing to Iman

Thank you for helping! Iman is a small, dependency-light codebase: plain HTML, CSS and
JavaScript ES modules with no framework and no build step. Please read the
[Code of Conduct](CODE_OF_CONDUCT.md) first.

## Run it locally

Requirements: Node.js 22 or newer (only for the dev tools and tests; the app itself is
static files).

```bash
git clone https://github.com/<username>/iman.git
cd iman
npm install     # ESLint, Prettier, and the packages vendored into lib/
npm start       # http://localhost:8080 (or: npx serve .)
npm test        # unit tests
npm run lint    # ESLint + Prettier check
```

On `localhost` the service worker uses the network first, so a normal reload shows your
changes. Use `?debugTime=2026-10-12T11:23:50` to fake the time, and **Settings → Advanced
→ Developer mode** for the debug helpers.

Camera, compass, notifications and service workers need HTTPS (or `localhost`). To test on
a phone, use a tunnel or deploy a fork to GitHub Pages.

## Project structure

```
index.html, wake.html     pages (strict CSP, no inline scripts or styles)
manifest.webmanifest      PWA manifest
sw.js                     service worker: offline cache, updates, notifications
css/style.css             all styles (design tokens at the top, logical properties for RTL)
js/app.js                 bootstrap, tab routing, the 1-second tick
js/boot.js                tiny pre-paint script (theme, direction) - the only classic script
js/config/defaults.js     every default value in ONE place
js/config/schema.js       every setting: type, range, options, section, labels
js/config/methods.js      country -> suggested calculation method
js/config/travel-rules.js travel rulings per madhab (the ONLY place rulings live)
js/config/constants.js    fixed vocabularies (prayers, statuses, storage keys)
js/settings.js            validate / clamp / migrate / import / export settings
js/prayer.js              adhan wrapper: times, next prayer, prayer windows
js/time.js, clock.js      time-zone helpers, ?debugTime clock
js/location.js            GPS, city search, nearest city
js/qibla.js               bearing, compass smoothing
js/tracker.js             tracker storage, streaks, stats, travel flags
js/travel.js              travel mode logic: rules in effect, suggestions, stay, combining, trips
js/flight.js              in-flight prayer times along the great-circle route
js/airports.js            bundled airports: load, search, nearest
js/reminders.js           which alerts fire when (pure)
js/notify.js              showing notifications, permissions
js/audio.js, idb.js       chime/alarm synthesis, user audio files (IndexedDB)
js/focus.js               prayer focus lock
js/wake*.js, sink-check.js  wake check page, URL parameters, state machine, detection
js/pwa.js                 service worker registration, install prompt
js/views/*.js             screens and settings widgets
js/i18n/*.js              strings (en.js is the reference)
data/cities.json          bundled GeoNames city list
data/airports.json        bundled OurAirports list (large/medium airports with IATA codes)
lib/                      vendored adhan, tfjs, coco-ssd (+ model) with licenses
scripts/                  vendor, build-cities, build-airports, make-icons, dev server
tests/                    node:test unit tests, detector test bench
```

Pure logic (prayer times, reminders, tracker, settings, wake check rules) has no DOM access
and is unit tested in Node. Keep it that way: put DOM code in `js/views/` or the page
controllers.

## How to add a setting

1. Add the default to `js/config/defaults.js`.
2. Add one entry to `js/config/schema.js` (key, type, section, range/options, and
   optionally `group`, `showIf`, `unit`).
3. Add the label (`set.<key>`) and optional help text (`set.<key>.help`) and option labels
   (`opt.<key>.<value>`) to `js/i18n/en.js`, then to the other languages.
4. Read it with `ctx.values()['your.key']` (views) or pass `values` into pure functions.

The Settings screen, search, reset, validation, import/export and "share my setup" pick it
up automatically. Tests fail if a setting has no default, no label or untranslated options.
If you rename or remove a setting, add a migration in `js/settings.js` (`MIGRATIONS`) and
bump `SETTINGS_VERSION` in the schema so existing users keep their values.

## How to suggest a calculation method for a country

Edit `COUNTRY_METHODS` in `js/config/methods.js` (ISO 3166-1 alpha-2 code → method id) and
link the official source (ministry, national authority) in your pull request. If your
country uses parameters no built-in method matches, describe them in an issue: we may add
a method.

## How to propose a correction to the travel rulings

All travel rulings (distance, length of stay, shortening, combining, in-flight guidance)
live in one file: `js/config/travel-rules.js`. The app never states a ruling that isn't in
that file. The values are the commonly cited positions per madhab and are marked for review
by a qualified scholar.

To propose a correction:

1. Open an issue or a pull request that changes **only** `js/config/travel-rules.js` (and
   the matching sentence in `js/i18n/*.js` if the wording must change).
2. **Include a source**: the book and chapter (for example "Ibn Qudamah, al-Mughni, chapter on
   the traveller's prayer"), or a fatwa from a recognised body, with a link if one exists.
   Add it to the `sources` list of that madhab in English and Arabic.
3. Explain which madhab and which field (`distanceKm`, `maxStayDays`, `stayLimit`,
   `excludeArrivalDeparture`, `shortening`, `combining`, ...) and why.

Pull requests without a source can't be merged. Remember that users can always override the
numbers with the Custom madhab, so a correction should reflect the madhab's position, not a
personal preference.

## How to rebuild the airports list

`data/airports.json` is generated from [OurAirports](https://ourairports.com/data/) (public
domain):

```bash
curl -L -o /tmp/airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
npm run airports -- /tmp/airports.csv
```

The script keeps large and medium airports with an IATA code and gives each one the time
zone of the nearest city in the same country from `data/cities.json` (OurAirports has no
time zone column), so rebuild the cities first if you changed them. Keep the file under
~500 KB; `npm test` checks its validity and size. Don't hand-edit `data/airports.json`.

## How to add a language

1. Copy `js/i18n/en.js` to `js/i18n/<code>.js` (for example `fr.js`), set `code`, `name`,
   `dir` (`ltr` or `rtl`), `locale` and `numerals` (`latn` or `arab`), and translate the
   values. Keep every `{placeholder}`.
2. Add the code to `LANGUAGE_CODES` in `js/i18n/index.js` (it then appears in the
   Language setting), add its name as `opt.appearance.language.<code>` in every language
   file, and add the file to the `SHELL` list in `sw.js` so it works offline.
3. Plurals: add `.one`, `.other` (and `.zero`, `.two`, `.few`, `.many` if your language uses
   them; see `Intl.PluralRules`) for keys such as `tracker.days`.
4. Run `npm test`: it checks that every key is translated and placeholders match.

## How to add or fix a city

The city list is generated from GeoNames by `scripts/build-cities.mjs` (instructions at the
top of the script). To fix a wrong Arabic name, add the GeoNames id to `AR_OVERRIDES` in
that script. To include more places, adjust the population threshold or the country list
(keep `data/cities.json` under ~3 MB), then rebuild and commit the JSON. Don't hand-edit
`data/cities.json`.

## Coding style

- Plain ES modules, no framework, no build step, no new runtime dependencies without
  discussion (open an issue first).
- Prettier formats everything (`npm run format`); ESLint must pass.
- Build DOM with the `h()` helper in `js/ui.js` and `textContent`, never `innerHTML` with
  dynamic data. No `eval`, no inline scripts or styles (the CSP blocks them).
- Validate anything read from storage, URLs or imported files against the schema.
- Every user-facing string goes through `t()`. Use logical CSS properties
  (`margin-inline-start`, `inset-inline-end`) so RTL works.
- Accessibility: labels on every control, keyboard support, visible focus, respect
  `prefers-reduced-motion`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):
`feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `test: ...`, `chore: ...`,
`refactor: ...`. Scopes we use: settings, prayer, location, tracker, qibla, notify, focus,
wake, guide, pwa, i18n, travel, tracker, flight, time.

## Pull request checklist

- [ ] `npm test` and `npm run lint` pass.
- [ ] New settings are in the schema and defaults, with English labels (and other languages
      if you can).
- [ ] New files the app loads are in the `SHELL` list in `sw.js` (a test checks this).
- [ ] Works offline, in Arabic (RTL), at 360 px wide, in light and dark mode.
- [ ] No network requests to third parties, no tracking, no new dependencies without
      discussion.
- [ ] `CHANGELOG.md` updated under "Unreleased" for user-visible changes.
