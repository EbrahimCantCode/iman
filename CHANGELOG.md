# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-12

### Added

- **Travel mode** (وضع السفر) with a manual switch on Today, in Settings and on saved trips;
  works without GPS, location or a home location. Optional destination and planned stay.
- Opt-in auto-detect that only suggests turning travel mode on (beyond the madhab's travel
  distance from home) or off (back home after being away); a manual choice always wins.
- Travel rulings in one reviewable file, `js/config/travel-rules.js` (Hanafi, Maliki,
  Shafiʿi, Hanbali, with sources), overridable with a Custom madhab. Marked for review by a
  qualified scholar.
- Shortened prayers ("2 rakʿahs") under Dhuhr, Asr and Isha; combined prayer windows with
  early (jamʿ taqdim) or delayed (jamʿ taʾkhir) combining; next prayer and countdown that
  understand combining; one reminder per combined pair (setting); Hanafi formal combining
  option, clearly labelled.
- "Day N of your trip" and a reminder when the stay approaches the madhab's limit.
- Tracker flags for shortened and combined prayers (still on time for streaks), ✈ travel
  days in the heatmap and a travel-day count.
- Trip planner: destination prayer times per day in the destination's time zone, home time
  alongside, suggested method for the destination, Qibla, saved trips and a start offer.
- Flight prayer times along the great-circle route with times in both time zones, the
  country below, the Qibla at each point, guidance from the rules file and optional
  reminders. Bundled `data/airports.json` (OurAirports, public domain) and
  `scripts/build-airports.mjs`.
- New Travel settings section (auto-detect, re-suggest distance, madhab, custom rulings,
  units, home location, combined windows and reminders, home time, stay reminder).

### Changed

- GPS fixes use the nearest city's time zone instead of the device's (correct before the
  phone switches zones); the debug time picker works in the location's zone and writes
  `?debugTime` with an explicit offset.
- The wake check link always carries the language in use.
- Tracker data format version 2 (adds optional travel flags). Version 1 data loads unchanged.

## [0.1.0] - 2026-10-12

First release.

### Added

- Prayer times for all adhan-js calculation methods plus a custom method, with the method
  suggested from the user's country; Asr madhab, high-latitude rules, per-prayer minute
  adjustments, optional Imsak, Duha and Tahajjud, 12/24-hour time and a Hijri date offset.
- Today screen with Hijri and Gregorian dates, next prayer with a live countdown, the
  current prayer window and its remaining time.
- Location by GPS, offline search of a bundled GeoNames city list (English and Arabic) or
  manual coordinates, with time-zone aware calculation.
- First-run onboarding (language, location, method, notifications), skippable and
  re-runnable.
- Qibla compass with distance to Makkah, iOS and Android sensor handling, smoothing,
  alignment feedback and a static fallback.
- Prayer tracker with prayed / late (qada) / missed statuses, two streak rules, last-7-day
  and weekly completion, a 30-day heatmap, a day editor and optional Sunnah tracking.
- Notifications: at-time alerts, reminders before prayers and before a prayer's time ends,
  sunrise warning, Friday Jumuʿah reminder, fill-in reminder, quiet hours, volume and
  vibration; user-provided adhan and Fajr adhan files; synthesised chime.
- Prayer focus lock overlay with fullscreen and screen wake lock where supported, "I've
  prayed" auto-marking and an emergency press-and-hold exit.
- Fajr wake check (`wake.html`): looping alarm with volume ramp-up that stops only after
  on-device sink detection (TensorFlow.js + COCO-SSD, multi-scale), an arithmetic fallback,
  an optional reference-photo check and URL parameters for use from iOS Shortcuts.
- In-app iPhone and Android setup guide with "Copy this week's times".
- Settings generated from a single schema: search, per-section and global reset,
  validation and migrations, export/import, "share my setup", delete all data.
- PWA: manifest, original icons, offline service worker with update prompt, install help.
- English and Arabic with RTL layout and Arabic-Indic numerals; dark and light themes,
  accent colours and text sizes.
- Developer mode with `?debugTime=` time travel and detection score logging; detector test
  bench.

[Unreleased]: https://github.com/<username>/iman/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/<username>/iman/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/<username>/iman/releases/tag/v0.1.0
