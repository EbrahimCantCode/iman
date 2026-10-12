# Third-party licenses

Iman itself is released under the [MIT License](LICENSE). It bundles the following
third-party software and data. Their full license texts are kept next to the vendored
files in `lib/`.

## Software

| Component                                                                                                 | Version | Used for                               | License    | Files                                             |
| --------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------- | ---------- | ------------------------------------------------- |
| [adhan-js](https://github.com/batoulapps/adhan-js) © 2016 Batoul Apps                                     | 4.4.6   | Prayer times, Qibla direction          | MIT        | `lib/adhan/` (license: `lib/adhan/LICENSE`)       |
| [TensorFlow.js](https://github.com/tensorflow/tfjs) © Google LLC                                          | 4.22.0  | On-device inference for the wake check | Apache-2.0 | `lib/tfjs/` (license: `lib/tfjs/LICENSE`)         |
| [COCO-SSD for TensorFlow.js](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) © Google LLC | 2.2.3   | Object detection (sink, toilet, ...)   | Apache-2.0 | `lib/coco-ssd/` (license: `lib/coco-ssd/LICENSE`) |
| COCO-SSD `lite_mobilenet_v2` model weights, published by the TensorFlow.js team                           | 2.2.3   | Object detection model                 | Apache-2.0 | `lib/coco-ssd/model/`                             |

The TensorFlow.js bundle (`lib/tfjs/tf.min.js`) includes small third-party libraries
whose license headers are preserved inside the file.

The COCO-SSD model was trained on the [COCO dataset](https://cocodataset.org/) (annotations
licensed CC BY 4.0).

## Data

| Data                                                                                                  | Used for                                                              | License                                                   | Files                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- |
| [GeoNames](https://www.geonames.org/) cities with population ≥ 15,000, plus places ≥ 5,000 in the GCC | Offline city search and "nearest city" for GPS and manual coordinates | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `data/cities.json` (built by `scripts/build-cities.mjs`) |

| [OurAirports](https://ourairports.com/data/) large and medium airports with IATA codes | Flight prayer times (airport search, positions, "over which country") | Public domain | `data/airports.json` (built by `scripts/build-airports.mjs`; time zones taken from the nearest GeoNames city in the same country) |

Attribution: city data © GeoNames (www.geonames.org), licensed under CC BY 4.0. Arabic
city names are taken from GeoNames alternate names and lightly normalised.

## Not included

- No adhan recording is bundled. Users add their own audio file (stored on their device)
  or self-hosters list their own files in `assets/audio/sounds.json`.
- The chime and alarm tones are synthesised at runtime with the Web Audio API.
- Icons are original artwork drawn by `scripts/make-icons.mjs`.
- No web fonts: Iman uses the system fonts of each device.
