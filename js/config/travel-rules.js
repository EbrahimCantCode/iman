// TODO: verify with a qualified scholar.
//
// Travel rulings (qasr = shortening, jam' = combining) per madhab, in ONE place.
// These are the commonly cited positions, pre-filled for review. They are
// not a fatwa, and every number can be overridden in Settings ("Custom")
// because opinions differ and users may follow their own scholar.
//
// To propose a correction, open a pull request that changes this file and
// cites a source (book and chapter, or a fatwa body). See CONTRIBUTING.md.
//
// Fields:
//   distanceKm         default distance from home that makes you a traveller
//   distanceRangeKm    the range of commonly cited values, shown for context
//   maxStayDays        stay length at which you stop counting as a traveller
//   stayLimit          "moreThan": a traveller while the intended stay is <= maxStayDays
//                      "atLeast":  a traveller while the intended stay is <  maxStayDays
//   excludeArrivalDeparture  whether the arrival and departure days are left out of the count
//   shortening         "obligatory" | "optional" (4-rak'ah prayers only)
//   combining          allowed real combining: [] | ["early"] | ["delayed"] | ["early", "delayed"]
//   formalCombining    Hanafi option: Dhuhr at the end of its time, Asr at the start of its
//                      time (each prayed in its own time, so not real combining)
//   flight             guidance shown with in-flight prayer times
//   sources            where the position is commonly cited from

/** Only 4-rak'ah prayers are shortened (to 2). Fajr and Maghrib never are. */
export const SHORTENED_PRAYERS = Object.freeze(['dhuhr', 'asr', 'isha']);

/** Prayers that may be combined, as [first, second] pairs. */
export const COMBINE_PAIRS = Object.freeze([
  Object.freeze(['dhuhr', 'asr']),
  Object.freeze(['maghrib', 'isha']),
]);

const MAJORITY = {
  distanceKm: 83,
  distanceRangeKm: [81, 89],
  maxStayDays: 4,
  stayLimit: 'moreThan',
  excludeArrivalDeparture: true,
  shortening: 'optional',
  combining: ['early', 'delayed'],
  formalCombining: false,
  flight: { seatedIfCannotStand: true, combineIfAllowed: true },
};

export const TRAVEL_RULES = Object.freeze({
  shafii: Object.freeze({
    ...MAJORITY,
    sources: Object.freeze([
      'al-Nawawi, al-Majmuʿ Sharh al-Muhadhdhab, chapter on the traveller’s prayer',
      'al-Nawawi, Minhaj al-Talibin, chapter on shortening and combining',
    ]),
  }),
  maliki: Object.freeze({
    ...MAJORITY,
    sources: Object.freeze([
      'Khalil ibn Ishaq, al-Mukhtasar, chapter on shortening the prayer',
      'Ibn Rushd, Bidayat al-Mujtahid, book of prayer: the traveller’s prayer',
    ]),
  }),
  hanbali: Object.freeze({
    ...MAJORITY,
    sources: Object.freeze([
      'Ibn Qudamah, al-Mughni, chapter on the traveller’s prayer',
      'al-Buhuti, al-Rawd al-Murbiʿ, chapter on the prayer of people with excuses',
    ]),
  }),
  hanafi: Object.freeze({
    distanceKm: 77,
    distanceRangeKm: [77, 88],
    maxStayDays: 15,
    stayLimit: 'atLeast',
    excludeArrivalDeparture: false,
    shortening: 'obligatory',
    // No real combining outside Arafah and Muzdalifah.
    combining: [],
    formalCombining: true,
    flight: { seatedIfCannotStand: true, combineIfAllowed: false },
    sources: Object.freeze([
      'al-Marghinani, al-Hidayah, chapter on the traveller’s prayer',
      'Ibn ʿAbidin, Radd al-Muhtar, chapter on the traveller’s prayer',
    ]),
  }),
});

export const TRAVEL_MADHABS = Object.freeze(['hanafi', 'maliki', 'shafii', 'hanbali']);
