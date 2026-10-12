# Wake check: sink detector results

The wake check uses TensorFlow.js with the COCO-SSD **lite_mobilenet_v2** model (about 18 MB,
vendored in `lib/coco-ssd/model/`). COCO has a `sink` class and a `toilet` class, but **no
bathtub class**.

## Test set

Nine openly licensed photos from Wikimedia Commons (not committed to the repo; see
"Reproduce" below). Scores are the best confidence for the class, 0 means not detected.
Accepted at the default threshold **0.6**.

| Photo     | What it shows                                  | Sink (full frame only) | Sink (multi-scale) | Toilet   | Result (sink only)                |
| --------- | ---------------------------------------------- | ---------------------- | ------------------ | -------- | --------------------------------- |
| sink-1    | Wide shot of 3 hotel washbasins                | 0.00                   | 0.53               | 0.00     | fail (too far)                    |
| sink-2    | Close-up of a metal sink                       | 0.86                   | **0.90**           | 0.00     | **pass**                          |
| sink-3    | Black-and-white macro of trough sinks and taps | 0.00                   | 0.00               | 0.00     | fail                              |
| bathtub-1 | White bathtub, close                           | 0.76                   | **0.76**           | 0.39     | **pass** (detected as "sink")     |
| bathtub-2 | Bathtub in a dark hotel bathroom               | 0.00                   | 0.00               | 0.00     | fail                              |
| toilet-1  | Toilet in a bathroom                           | 0.00                   | 0.22               | **0.96** | fail (pass if toilet is accepted) |
| counter-1 | White kitchen countertop                       | 0.23                   | 0.23               | 0.00     | fail                              |
| counter-2 | Beige laminate countertop                      | 0.00                   | 0.00               | 0.00     | fail                              |
| wall-1    | White painted wall                             | 0.00                   | 0.00               | 0.00     | fail                              |

"Multi-scale" is what the app does: it runs the model on the full frame and on two centre
crops (75% and 55%) and keeps the best score. It roughly triples the work (about 0.5 s per
photo on a desktop, more on a phone) and noticeably helps when the object is small in the
frame (wide sink shot 0.00 → 0.53, toilet 0.00 → 0.96) without raising the scores of
counters, walls or empty scenes.

Colour histogram similarity against the passing sink (used by the optional reference photo
check) ranged from 0.04 (wall) to 0.81 (beige countertop): a colour histogram is a weak
anti-cheat signal on its own, which is why it only runs **after** a sink was detected.

## What this means

- Point the camera at the sink from close up, with the light on. Wide or unusual shots
  (black-and-white, extreme close-ups of taps) can be missed; after the configured number of
  failed photos the arithmetic challenge unlocks, so nobody gets stuck.
- Kitchen counters and walls did not pass, so the default 0.6 threshold is reasonable.
- A white bathtub may pass as a "sink". For waking up for Fajr (getting to the bathroom for
  wudu) that is acceptable. If you want only your own sink, turn on the reference photo.
- To accept toilets too, add "Toilet" under Settings → Wake check → Accepted objects.

## Reproduce

1. Put photos in `tests/fixtures/local/` (git-ignored).
2. Run `npm start` and open
   `http://localhost:8080/tests/detector.html?images=sink-1.jpg,toilet-1.jpg`,
   or pick files on that page. Nothing is uploaded.

## Photo credits (Wikimedia Commons)

| File      | Title                                                                                                                                                                                                        | Author           | License      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | ------------ |
| sink-1    | [Washbasins of the restrooms in Crowne Plaza Vientiane](https://commons.wikimedia.org/wiki/File:Washbasins_of_the_restrooms_in_Crowne_Plaza_Vientiane.jpg)                                                   | Basile Morin     | CC BY-SA 4.0 |
| sink-2    | [A sink on USS Pampanito](https://commons.wikimedia.org/wiki/File:A_sink_on_USS_Pampanito.jpg)                                                                                                               | Slyronit         | CC BY-SA 4.0 |
| sink-3    | [Sink and taps in the men's locker room 3 BW](https://commons.wikimedia.org/wiki/File:Sink_and_taps_in_the_men%27s_locker_room_3_BW.jpg)                                                                     | W.carter         | CC BY-SA 4.0 |
| bathtub-1 | [Bathroom - bathtub - rounded shower](https://commons.wikimedia.org/wiki/File:Bathroom_-_bathtub_-_rounded_shower.jpg)                                                                                       | see file page    | CC BY-SA 4.0 |
| bathtub-2 | [Bathtub in bathroom of premier room in Buddha bar hotel Prague](https://commons.wikimedia.org/wiki/File:Bathtub_in_bathroom_of_premier_room_in_Buddha_bar_hotel_Prague.jpg)                                 | Pittigrilli      | CC BY-SA 4.0 |
| toilet-1  | [Bathroom - toilet 01](https://commons.wikimedia.org/wiki/File:Bathroom_-_toilet_01.JPG)                                                                                                                     | Andrey Korzun    | CC BY-SA 4.0 |
| counter-1 | [Countertop in a white kitchen](https://commons.wikimedia.org/wiki/File:Countertop_in_a_white_kitchen.jpg)                                                                                                   | Rickson93        | CC BY-SA 4.0 |
| counter-2 | [Laminate Kitchen Countertop Beige](https://commons.wikimedia.org/wiki/File:Laminate_Kitchen_Countertop_Beige.jpg)                                                                                           | Kurtkaiser       | CC0          |
| wall-1    | [White painted moderately eroded marked concrete seamless building wall texture](https://commons.wikimedia.org/wiki/File:White_painted_moderately_eroded_marked_concrete_seamless_building_wall_texture.jpg) | Sisters.seamless | CC0          |
