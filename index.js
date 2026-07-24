const { DEFAULT_BROOKLYN_LOCATION } = require('./constants');

// Force a fixed process timezone so Date getters used internally by @hebcal are
// deterministic regardless of the host machine's configured timezone.
if (!process.env.TZ) process.env.TZ = 'UTC';

function localYMD(instant, tzid) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tzid,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(instant);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function calendarNoonUTC({ year, month, day }) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

async function resolveTzid(lat, lng) {
  try {
    const geoTz = require('geo-tz');
    const zones = geoTz.find(lat, lng);
    if (zones && zones.length) return zones[0];
  } catch (e) {
    // fall through to default
  }
  return DEFAULT_BROOKLYN_LOCATION.tzid;
}

const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const ENGLISH_DAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

function formatEnglishDate(instant, tzid) {
  const { year, month, day } = localYMD(instant, tzid);
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: tzid, weekday: 'long' }).format(instant);
  return {
    year, month, day,
    display: `${dow}, ${ENGLISH_MONTHS[month - 1]} ${day}, ${year}`,
  };
}

/**
 * Builds everything the home page's zmanim/date widgets need for a given
 * location and moment in time.
 *
 * - English date flips at local civil midnight.
 * - Hebrew/Yiddish date flips at halachic nightfall (72 fixed minutes after sunset).
 * - From that flip until the next sunrise, the Hebrew date is shown with the
 *   "אור ליום" prefix (e.g. אור ליום ט"ו שבט תשפ"ו לפ"ק).
 * - Daf Yomi flips at civil midnight (see utils/dafyomi.js).
 */
async function getHomeCalendarData({ lat, lng, tzid, label, now = new Date(), defaultLocation } = {}) {
  const hebcal = await import('@hebcal/core');
  const { HDate, Location, Zmanim } = hebcal;
  const { getTodaysDaf } = require('./dafyomi');

  const fallback = defaultLocation || DEFAULT_BROOKLYN_LOCATION;
  const latitude = typeof lat === 'number' ? lat : fallback.lat;
  const longitude = typeof lng === 'number' ? lng : fallback.lng;
  const usingDefault = typeof lat !== 'number' || typeof lng !== 'number';
  const resolvedTzid = tzid || (usingDefault ? fallback.tzid : await resolveTzid(latitude, longitude));
  const resolvedLabel = label || (usingDefault ? fallback.label : 'Your location');

  const ymd = localYMD(now, resolvedTzid);
  const calDate = calendarNoonUTC(ymd);

  const isIL = resolvedTzid === 'Asia/Jerusalem' || resolvedTzid === 'Asia/Tel_Aviv';
  const loc = new Location(latitude, longitude, isIL, resolvedTzid, resolvedLabel, isIL ? 'IL' : 'US');
  const z = new Zmanim(loc, calDate, false);

  const sunrise = z.sunrise();
  const sunset = z.sunset();
  const tzeit72 = z.sunsetOffset(72, false);

  const hdToday = new HDate(calDate);

  let hebrewDate;
  let prefixOn;
  if (now < sunrise) {
    hebrewDate = hdToday;
    prefixOn = true;
  } else if (now < tzeit72) {
    hebrewDate = hdToday;
    prefixOn = false;
  } else {
    hebrewDate = hdToday.next();
    prefixOn = true;
  }

  const gematriyaText = `${hebrewDate.renderGematriya(true)} לפ״ק`;
  const hebrewDisplay = prefixOn ? `אור ליום ${gematriyaText}` : gematriyaText;

  // Daf Yomi changes at the viewer's local civil midnight, so use the same
  // location-local calendar day (pinned to noon UTC) rather than the raw instant.
  const daf = await getTodaysDaf(calDate);

  return {
    location: { label: resolvedLabel, lat: latitude, lng: longitude, tzid: resolvedTzid, isDefault: usingDefault },
    english: formatEnglishDate(now, resolvedTzid),
    hebrew: {
      display: hebrewDisplay,
      withoutPrefix: gematriyaText,
      prefixOn,
      isoDate: hebrewDate.greg().toISOString().slice(0, 10),
      year: hebrewDate.getFullYear(),
      monthName: hebrewDate.getMonthName(),
      day: hebrewDate.getDate(),
    },
    dafYomi: daf,
    zmanim: {
      // Ordered to match how they're displayed: sunrise -> Shma (early/late)
      // -> Tfilla (early/late) -> chatzot -> sunset -> tzeit 60 -> tzeit 72.
      sunrise: sunrise.toISOString(),
      sofZmanShmaMGA: z.sofZmanShmaMGA().toISOString(),
      sofZmanShma: z.sofZmanShma().toISOString(),
      sofZmanTfillaMGA: z.sofZmanTfillaMGA().toISOString(),
      sofZmanTfilla: z.sofZmanTfilla().toISOString(),
      chatzot: z.chatzot().toISOString(),
      sunset: sunset.toISOString(),
      tzeit60: z.sunsetOffset(60, false).toISOString(),
      tzeit72: tzeit72.toISOString(),
      minchaGedola: z.minchaGedola().toISOString(),
      minchaKetana: z.minchaKetana().toISOString(),
      plagHaMincha: z.plagHaMincha().toISOString(),
      alotHaShachar: z.alotHaShachar().toISOString(),
      misheyakir: z.misheyakir().toISOString(),
    },
  };
}

module.exports = { getHomeCalendarData, resolveTzid, localYMD, calendarNoonUTC };
