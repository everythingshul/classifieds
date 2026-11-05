// Turns a typed zip code or city name into {lat, lng, label} for the zmanim
// and weather widgets - no API key needed (same no-key philosophy as
// weather.js's Open-Meteo call): US zip codes go through Zippopotam.us,
// anything else through Open-Meteo's free geocoding API.
async function geocodeZipOrCity(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  if (/^\d{5}$/.test(q)) {
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${q}`);
      if (res.ok) {
        const data = await res.json();
        const place = data.places && data.places[0];
        if (place) {
          return {
            lat: parseFloat(place.latitude),
            lng: parseFloat(place.longitude),
            label: `${place['place name']}, ${place['state abbreviation']}`,
          };
        }
      }
    } catch (e) { /* fall through to the city-name lookup below */ }
  }

  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results && data.results[0];
    if (!r) return null;
    const region = r.admin1 || r.country;
    return { lat: r.latitude, lng: r.longitude, label: region ? `${r.name}, ${region}` : r.name };
  } catch (e) {
    return null;
  }
}
