# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/<username>/iman/security/advisories/new)
("Security" tab → "Report a vulnerability"). Include steps to reproduce, the affected
version (shown at the bottom of Settings) and the browser/OS.

You can expect an acknowledgement within 7 days. We'll work on a fix, credit you if you
wish, and publish an advisory once a fixed version is deployed.

## Supported versions

Only the latest deployed version (the `main` branch) receives fixes. Installed copies
update themselves automatically.

## Security and privacy design

- **No backend, no accounts, no analytics, no trackers.** All user data (settings,
  location, tracker history, audio files, the reference photo's colour histogram) stays
  in the browser's storage on the user's device.
- **No network requests after install** except to the app's own origin. City search,
  prayer calculation, the Qibla and object detection run on-device; the TensorFlow.js
  model is vendored in `lib/` and cached by the service worker. Wake check photos are
  processed in memory only and never stored or uploaded.
- **Strict Content Security Policy** on every page (`<meta http-equiv>`), so no inline
  scripts or styles and no third-party origins:

  ```
  default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:;
  media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
  ```

  (`frame-ancestors` can't be set from a meta tag; set it as a header if your host allows.)

- **No `eval` or `new Function`** in Iman's code (enforced by ESLint).
- **No `innerHTML` with dynamic data**: the UI is built with `createElement` and
  `textContent`.
- **Untrusted input is validated against the settings schema**: stored settings on load,
  imported JSON files (size-limited, unknown keys ignored, prototype-pollution safe) and
  `wake.html` URL parameters. Invalid values are rejected or clamped.
- **Minimal permissions**, each requested only when the user turns the feature on:
  location (or pick a city instead), notifications, motion/orientation (iOS compass) and
  the camera (wake check only).
- **Vendored dependencies** are pinned (`package.json`, `package-lock.json`) and copied
  into `lib/` by `scripts/vendor.mjs`, which verifies the model weight size against the
  model manifest. Their licenses are in `lib/*/LICENSE`.

If you self-host, serve Iman over HTTPS and consider adding these response headers:
`Content-Security-Policy` (same policy plus `frame-ancestors 'none'`),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and
`Permissions-Policy: camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)`.
