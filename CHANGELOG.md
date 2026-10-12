# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/<username>/iman/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<username>/iman/releases/tag/v0.1.0
