# Iman · إيمان

**A free, open-source, offline-first prayer app.** Prayer times, a Qibla compass, a prayer
tracker, adhan reminders, a prayer focus lock and a Fajr "wake check", in English and
Arabic. No account, no ads, no tracking: everything stays on your device.

Iman is a Progressive Web App (PWA): you install it from your browser, it works offline, and
it runs on iPhone, Android and desktop.

[![CI](https://github.com/<username>/iman/actions/workflows/ci.yml/badge.svg)](https://github.com/<username>/iman/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## How to download and install Iman

Iman is installed **from your web browser**, not from the App Store or Play Store. It is
free and needs no account.

### 👉 [Open Iman: https://\<username>.github.io/iman/](https://<username>.github.io/iman/)

On a computer? Scan this code with your phone's camera:

![QR code linking to the Iman web app](docs/images/qr.png)

### iPhone and iPad (Safari)

![Installing Iman on iPhone (screenshot placeholder)](docs/images/install-ios.png)

1. Open the link above in **Safari**. (Other browsers on older iOS versions can't install
   apps.)
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**, then tap **Add**.
4. Open **Iman** from the new icon on your Home Screen.
5. Allow location when Iman asks (or pick your city).
6. To get prayer notifications, go to **Settings → Reminders and adhan** in Iman and switch
   on **Notifications**. This only works in the Home Screen app, on iOS 16.4 or later.

### Android (Chrome)

![Installing Iman on Android (screenshot placeholder)](docs/images/install-android.png)

1. Open the link above in **Chrome**.
2. Tap **Install app** in the banner, or open the **⋮** menu and tap **Install app** (or
   **Add to Home screen**).
3. Open **Iman** from your app drawer.
4. Allow location and notifications when asked.

### Samsung Internet and Firefox (Android)

- **Samsung Internet:** open the link, tap the menu (☰), then **Add page to → Home screen**.
- **Firefox:** open the link, tap **⋮**, then **Install** (or **Add to Home screen**).

### Computer (Chrome or Edge)

![Installing Iman on a computer (screenshot placeholder)](docs/images/install-desktop.png)

1. Open the link above.
2. Click the **install icon** at the right end of the address bar, then **Install**.

The Qibla compass and the wake check camera work best on a phone.

### Updating

Updates install automatically. When a new version is ready, Iman shows **"Update
available, tap to refresh"**. Tap it and you're done.

### Uninstalling

- **iPhone:** long-press the Iman icon → **Remove App** → **Delete from Home Screen**.
- **Android:** long-press the Iman icon → **Uninstall** (or drag it to Uninstall).
- **Computer:** open Iman, click **⋮** in its window → **Uninstall Iman**.

Uninstalling deletes everything Iman stored on your device (settings, tracker history). To
keep it, first export a backup: **Settings → Data and privacy → Export backup**.

### Troubleshooting

- **No "Add to Home Screen" on iPhone?** Open the link in Safari, not in another app's
  built-in browser.
- **Notifications don't appear?** On iPhone, open Iman from the Home Screen icon (not
  Safari) and turn notifications on inside Iman. Also check your phone's notification
  settings for Iman and that Focus / Do Not Disturb isn't silencing it.
- **The compass doesn't move?** Tap **Start compass** and allow motion access. Move the phone
  in a figure-8 to calibrate it, away from metal and magnets. Desktop computers usually have
  no compass.
- **Wrong location or times?** Pick your city manually (**Settings → Location**) and check
  the calculation method (**Settings → Prayer times**) against your local mosque.

## Features

- **Prayer times** for Fajr, Sunrise, Dhuhr, Asr, Maghrib and Isha (plus optional Imsak,
  Duha and Tahajjud) with a live countdown to the next prayer, the current prayer window and
  the Hijri date. All [adhan-js](https://github.com/batoulapps/adhan-js) calculation methods,
  a custom method, Hanafi/Standard Asr, high-latitude rules and per-prayer minute
  adjustments. The method is **suggested from your country** and always changeable.
- **Location** by GPS, by searching a bundled list of 34,000 cities (every city above 15,000
  people and every GCC town above 5,000, searchable in English and Arabic), or by typing
  coordinates. No online lookups.
- **Qibla compass** with distance to Makkah, smoothing, alignment feedback and a static
  bearing when there is no compass.
- **Prayer tracker**: mark each prayer as prayed, late (qada) or missed; streaks, last 7
  days, this week, a 30-day heatmap and optional Sunnah prayers.
- **Adhan and reminders**: alerts at prayer time, reminders before prayers and before a
  prayer's time ends, a sunrise warning, Friday Jumuʿah reminder, quiet hours, volume and
  vibration. Use your own adhan recording (a separate one for Fajr if you like).
- **Prayer focus lock**: a calm full-screen pause at prayer time while Iman is open, with
  an "I've prayed" button and an emergency press-and-hold exit.
- **Fajr wake check**: after your alarm, the wake check keeps ringing until you photograph
  a sink. Detection runs on your phone (TensorFlow.js + COCO-SSD); a maths challenge
  takes over after several failed photos or if the camera is unavailable.
- **Travel mode** (وضع السفر): know when you count as a traveller, see shortened (qasr) and
  combined (jamʿ) prayers on the Today screen, plan trips with prayer times at your
  destination in its own time zone, and see when each prayer begins during a flight. See
  [Travel mode](#travel-mode).
- **English and Arabic** with full right-to-left layout and Arabic-Indic numerals.
- **Dark and light themes**, accent colours and text sizes.
- **Everything is a setting**: every number and choice has a sensible default and can be
  changed, searched, reset per section, exported, imported and shared.

## Screenshots

_Screenshots coming soon._ (Today, Qibla, Tracker, Settings, focus lock, wake check, travel
mode, trip planner, flight prayer times.)

<!-- Placeholders: docs/images/travel-today.png, docs/images/trip-planner.png, docs/images/flight-times.png -->

## Privacy

Iman has **no accounts, no analytics, no ads and no trackers**. Your location, settings,
tracker history and audio files are stored only on your device (browser storage).

After it is installed, Iman makes **no network requests** except to load its own files
from the site it was installed from. City search, the Qibla, prayer calculation and the
wake check's object detection all run on your device. Wake check photos are processed in
memory and are never saved or uploaded.

## Travel mode

Travel mode helps you pray correctly and on time while travelling. Open it from the
**✈ Travel mode** switch on the Today screen, **Settings → Travel**, or a saved trip.

> **Rulings differ between scholars.** Iman follows the common position of the madhab you
> choose (Hanafi, Maliki, Shafiʿi, Hanbali, or Custom numbers from your own scholar). It is
> not a fatwa: ask a scholar you trust if unsure. Every ruling lives in one reviewable file,
> [`js/config/travel-rules.js`](js/config/travel-rules.js), with its sources.

### What it does

- **Manual switch, always.** Turn travel mode on or off with one tap. It works with no GPS,
  no location and no home set. When you switch it on you can add a destination and a
  planned length of stay; both are optional.
- **Suggestions, never surprises.** With auto-detect on (the default), when you are farther
  from your **home location** than your madhab's travel distance, Iman shows "Looks like
  you're travelling (X km from home). Turn on travel mode?" It never switches by itself.
  Your choice wins: after you turn it off, it won't suggest it again until you've moved
  (50 km by default); if you turn it on near home (about to leave), it stays on. When you're
  back near home after being away, it offers to turn travel mode off.
- **Length of stay.** "Day N of your trip", and as you approach your madhab's limit:
  "You've been here X days. If you plan to stay more than Y days, you're no longer a
  traveller (by your madhab)." Iman asks for your planned stay rather than assuming it.
- **Shortened and combined prayers on Today.** "2 rakʿahs (shortened)" under Dhuhr, Asr and
  Isha (Fajr and Maghrib are never shortened). Where your madhab allows combining, the
  combined windows ("Dhuhr + Asr: can be prayed together between 11:24 and 17:13") with a
  choice of early (jamʿ taqdim) or delayed (jamʿ taʾkhir). The next prayer and countdown
  follow your choice, and you can get one reminder per combined pair. For the Hanafi
  madhab, Iman shows the clearly labelled option of praying Dhuhr at the end of its time and
  Asr at the start of its time instead.
- **Tracker.** Prayers can record that they were shortened and/or combined (early or
  delayed); they still count as on time for streaks. Travel days get a ✈ in the heatmap.
- **Trip planner.** Pick a destination and dates to see the prayer times there for every
  day, **in the destination's time zone**, with your home time alongside, the suggested
  calculation method for that country (accept it or keep yours), and the Qibla. On the
  trip's first day Iman offers to start travel mode.
- **Flight prayer times.** Enter the departure and arrival airports (search by IATA code or
  city), the local departure time and the duration or local arrival time. Iman lists each
  prayer that begins during the flight, for example _"Maghrib ≈ 18:42 (BAH time) / 16:42
  (LHR time), over Romania, about 4 h 12 min after take-off"_, with the Qibla bearing at
  that point. You can turn on reminders for the flight.

Everything is calculated on your device and works offline, including the bundled airports
list.

### How flight prayer times are estimated (and their limits)

- The plane is assumed to fly the **great-circle route** (the shortest path over the Earth)
  at a **steady pace** from take-off to landing. Taxiing, climbing, air routes and delays are
  ignored, so real positions can differ.
- Iman steps through the flight minute by minute, computes the prayer times at the
  estimated position, and finds the moment the time on board passes each prayer's start.
  It handles flights across midnight and the date line, flights where the sun barely sets
  (flying west at sunset) or a prayer begins just after landing, and very short flights with
  no prayer.
- **Altitude is not taken into account:** adhan-js has no altitude input, so at cruising
  altitude the sun sets a few minutes later and rises a few minutes earlier than shown.
- Near the poles Iman uses your **high-latitude rule**; times there are rough.
- The Qibla bearing is from **true north**. To use it you need the aircraft's heading,
  shown on the in-flight map.
- Flight reminders, like all reminders, only appear while Iman is open.

## iPhone setup guide

A web app can't ring when the phone is locked, and it can't block other apps. iPhone's own
**Clock**, **Focus** and **Shortcuts** fill those gaps. The same guide is inside the app:
**Today → iPhone & Android setup guide**.

> Menu names can change between iOS versions. If yours differ, look for similar wording.

### 1. Install and allow notifications

Follow [iPhone and iPad (Safari)](#iphone-and-ipad-safari) above. Notifications need iOS
16.4 or later and only work in the Home Screen app.

### 2. Create a Prayer Focus

1. Open the **Settings** app → **Focus** → **+** → **Custom**. Name it **Prayer**.
2. Under **Notifications**, choose the people and apps that may still reach you (for
   example family, and Iman). Everything else stays silent.
3. Optional: use **Customise Screens** to show a calm Home Screen page while the Focus is on.

### 3. Turn the Focus on at prayer times

1. Open **Shortcuts** → **Automation** → **+** → **Time of Day**. Set a prayer's time,
   choose **Daily**, and select **Run Immediately**.
2. Add the action **Set Focus** → **Prayer** → **On**.
3. Make a second **Time of Day** automation a few minutes later (your focus duration, 15 by
   default) with **Set Focus** → **Prayer** → **Off**.
4. Repeat for each prayer.

**The trade-off:** prayer times move by a minute or so every few days, but these
automations use fixed times. Either update them once a week, or set each one to the
latest time of the week (the Focus then starts a little after the adhan on some days). In
Iman, **Setup guide → Copy this week's times** gives you a plain-text list of the week's
times plus the earliest and latest time of each prayer.

### 4. Fajr: alarm and wake check

1. Set your Fajr alarm in the **Clock** app. It rings even when the phone is locked or
   silenced, which a web app can't do.
2. In Iman, go to **Settings → Wake check** and tap **Copy my wake check link**.
3. In **Shortcuts** → **Automation** → **+** → **Alarm**, choose **Is Stopped**, pick your
   Fajr alarm and select **Run Immediately**.
4. Add the action **Open URLs** and paste your wake check link.
5. When you stop the alarm, the wake check opens and keeps ringing until you photograph a
   sink (or solve the maths problems).
6. So the camera doesn't ask every morning: in Safari tap **aA → Website Settings → Camera →
   Allow**.

#### Why the wake check opens in Safari (findings)

We looked for a reliable way to open the **installed Home Screen app** from Shortcuts and
there isn't one:

- **Open URLs** always opens the default browser, even for a site you installed.
- **Open App** only lists App Store apps; Home Screen web apps don't appear.
- iOS has no URL scheme or "app link" handling for Home Screen web apps.
- Safari and the Home Screen app keep **separate storage**, so the page opened by the
  Shortcut can't read the app's settings.

So the wake check is a standalone page (`wake.html`) and **the link carries your wake check
settings as URL parameters**, for example
`wake.html?threshold=0.6&attempts=5&math=3&difficulty=medium&objects=sink&tone=beacon&ramp=30&volume=100`.
It works without any saved state; copy the link again after changing wake check settings.
A successful wake check is logged in Safari's own copy of the tracker.

| Parameter             | Setting                                | Values (default)                                                             |
| --------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `threshold`           | Detection confidence                   | 0.3 – 0.95 (0.6)                                                             |
| `attempts`            | Failed photos before the fallback      | 3 – 15 (5)                                                                   |
| `math`                | Number of problems                     | 1 – 10 (3)                                                                   |
| `difficulty`          | Problem difficulty                     | easy, medium, hard (medium)                                                  |
| `objects`             | Accepted objects                       | comma list of sink, toilet, toothbrush, refrigerator, oven, microwave (sink) |
| `tone`                | Alarm tone                             | beacon, pulse, rising, custom (beacon)                                       |
| `ramp`                | Volume ramp-up, seconds                | 0 – 120 (30)                                                                 |
| `volume`              | Maximum volume, %                      | 10 – 100 (100)                                                               |
| `ref`, `refThreshold` | Reference photo colours and similarity | set by the app (off)                                                         |
| `lang`                | Language                               | en, ar                                                                       |

Invalid values are ignored and numbers are clamped, exactly like stored settings.

## Android setup guide

1. **Install** Iman from Chrome (see [Android](#android-chrome)) and allow notifications.
2. **Pause distracting apps:** Settings → **Digital Wellbeing & parental controls** →
   **Focus mode** (on newer phones: **Modes** or **Do Not Disturb**). Schedule it for prayer
   times or use **Modes and Routines** (Samsung) / **Routines**. The same weekly trade-off as
   on iPhone applies; use **Copy this week's times**.
3. **Fajr:** set the alarm in the **Clock** app. Add your wake check link to the Home screen
   (open it in Chrome → ⋮ → **Add to Home screen**) so it's one tap away, or let an
   automation app (Samsung Modes and Routines, Tasker, MacroDroid) open it when the alarm is
   dismissed.

Iman's notifications are more dependable on Android than on iPhone, but alerts while the
app is fully closed are still best-effort.

## Configuration

Every behaviour with a number or a choice is a setting with a default:

- [`js/config/defaults.js`](js/config/defaults.js): every default value, in one place.
- [`js/config/schema.js`](js/config/schema.js): each setting's type, range, options and
  section. The Settings screen, validation, migrations and import/export are generated
  from it.
- [`js/config/methods.js`](js/config/methods.js): which calculation method is suggested for
  which country.

Settings can be exported, imported and shared (**Settings → Data and privacy**). "Share my
setup" leaves out your location and reference photo.

## Adding your own adhan audio

Iman doesn't bundle an adhan recording, because most recordings can't be freely
redistributed. Two ways to add one:

- **In the app:** **Settings → Reminders and adhan → Your adhan audio → Add file**. Pick an
  audio file (up to 15 MB) for the adhan and, optionally, a different one for Fajr. Files
  stay on your device (IndexedDB).
- **Self-hosting:** put `adhan.mp3` (and optionally `adhan-fajr.mp3`, `alarm.mp3`) in
  `assets/audio/` and list them in `assets/audio/sounds.json`:

  ```json
  { "adhan": "adhan.mp3", "adhan-fajr": "adhan-fajr.mp3", "alarm": "alarm.mp3" }
  ```

  Only include recordings you have the right to redistribute.

Without an adhan file, a short synthesised chime plays instead.

## Known limitations

- **Closed-app notifications are not guaranteed.** A web app can't schedule system alarms.
  Alerts are reliable while Iman is open or in a background tab; when it is closed, delivery
  depends on the browser (on iPhone it generally won't happen without a push server, which
  Iman deliberately doesn't have). Where supported, Iman also uses Notification Triggers and
  Periodic Background Sync. Use the Clock app and Focus automations for anything critical.
- **No alarm on a locked phone and no app blocking.** That's why the setup guide uses the
  Clock app, Focus mode and Shortcuts. The focus lock only covers Iman itself.
- **iPhone audio:** sound needs a tap first, the ring/silent switch may mute web audio, and
  the volume of audio files follows the phone's volume buttons.
- **Wake check detection** uses a small model: photograph the sink from close up with the
  light on. COCO has no bathtub class, and a white bathtub may pass as a sink. See
  [docs/wake-check-detector.md](docs/wake-check-detector.md) for test results.
- **Calculated times** can differ by a few minutes from your local timetable. Use the
  per-prayer minute adjustments.
- **Travel rulings** are the commonly cited positions per madhab, pending review by a
  qualified scholar; use Custom if yours differ. **Flight times** are estimates (great-circle
  route, steady pace, no altitude).

## Running it yourself (developers)

```bash
git clone https://github.com/<username>/iman.git
cd iman
npx serve .
```

Then open http://localhost:3000. There is no build step: it's plain HTML, CSS and ES modules.
With Node.js 22+ you can also use the zero-dependency dev server (`npm start`, port 8080).
On `localhost` the service worker prefers the network, so your edits show up on reload.

### Deploy your own copy

- **GitHub Pages:** fork the repo, then **Settings → Pages → Build and deployment → Source:
  GitHub Actions**. The included workflow deploys on every push to `main`. Your copy is
  at `https://<your-username>.github.io/iman/`.
- **Any static host** (Netlify, Cloudflare Pages, your own server): upload the repository
  files (no build command; publish directory is the repository root). Serve over HTTPS,
  which service workers, notifications, the camera and the compass require.

### Development commands

| Command                      | What it does                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm install`                | Dev tools (ESLint, Prettier) and the source packages for `lib/`                                             |
| `npm test`                   | Unit tests (Node's built-in test runner)                                                                    |
| `npm run lint`               | ESLint + Prettier check                                                                                     |
| `npm run format`             | Format with Prettier                                                                                        |
| `npm run vendor`             | Copy adhan / TensorFlow.js / COCO-SSD from `node_modules` into `lib/` (`-- --model` re-downloads the model) |
| `npm run cities -- <folder>` | Rebuild `data/cities.json` from GeoNames dumps                                                              |
| `npm run icons`              | Redraw the app icons                                                                                        |
| `npm run airports -- <csv>`  | Rebuild `data/airports.json` from OurAirports' `airports.csv`                                               |

Testing helpers: add `?debugTime=2026-10-12T11:23:50+03:00` to the URL to fake the current
time (reminders, the focus lock, travel mode and flight reminders behave as if it were that
time), turn on **Settings → Advanced →
Developer mode** for a debug time picker and detection scores, and open
`tests/detector.html` to try the sink detector on still photos.

## Roadmap

Not built yet:

- A native version with a locked-phone alarm that requires the sink photo, and true app
  blocking (needs a Mac and an Apple Developer account on iOS).
- More languages.
- Quran verse of the day.
- Mosque finder (would need network access, so opt-in only).
- Live flight tracking or real flight routes for in-flight prayer times (needs network
  access).
- Automatic Qibla on the plane using the aircraft's heading.

## Contributing

Contributions are welcome: translations, calculation method suggestions for your country,
city fixes and code. See [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in
[SECURITY.md](SECURITY.md).

## Credits and licenses

Iman is released under the [MIT License](LICENSE). It includes:

- [adhan-js](https://github.com/batoulapps/adhan-js) by Batoul Apps (MIT): prayer times and Qibla.
- [TensorFlow.js](https://github.com/tensorflow/tfjs) and
  [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) by Google
  (Apache-2.0): on-device object detection.
- City data © [GeoNames](https://www.geonames.org/) (CC BY 4.0).
- Airport data from [OurAirports](https://ourairports.com/data/) (public domain).

Details and license texts: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) and `lib/*/LICENSE`.
