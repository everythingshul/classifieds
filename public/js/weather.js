// Weather data comes from Open-Meteo (https://open-meteo.com), a free
// weather API whose data is licensed CC BY 4.0 - reuse is permitted as long
// as it's attributed, which is why the widget below always links back to
// them. No API key is required and no usage terms are being violated.
//
// Location for this widget is independent from the zmanim card's (see
// home.js) - each has its own "change location" picker and its own
// localStorage key, so picking one never moves the other.
const WEATHER_LOC_STORAGE = 'jl_weather_location';

const WEATHER_CODES = {
  0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};

function weatherDescription(code) {
  return WEATHER_CODES[code] || 'Weather unavailable';
}

function getCustomWeatherLocation() {
  try { return JSON.parse(localStorage.getItem(WEATHER_LOC_STORAGE) || 'null'); } catch (e) { return null; }
}

async function renderWeatherWidget() {
  const el = document.getElementById('weatherWidget');
  if (!el) return;

  const custom = getCustomWeatherLocation();
  const browserLoc = custom ? null : await getBrowserLocation();
  const fallback = domainDefaultLocation();
  const loc = custom || browserLoc || fallback;
  const label = custom?.label || (browserLoc ? 'Your location' : fallback.label);
  const isDefault = !custom && !browserLoc;

  el.innerHTML = `
    <div class="combo-widget weather-widget">
      <div id="weatherLocPicker"></div>
      <div id="weatherForecast"><p class="hint" style="padding:6px 0">Loading forecast…</p></div>
    </div>
  `;
  initLocationPicker({
    root: document.getElementById('weatherLocPicker'),
    storageKey: WEATHER_LOC_STORAGE,
    label,
    isDefault,
    onChange: renderWeatherWidget,
  });

  const isHe = I18N.get() === 'he';
  const unit = isHe ? 'celsius' : 'fahrenheit';
  const degree = isHe ? '°C' : '°F';
  const forecastEl = document.getElementById('weatherForecast');

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=${unit}&forecast_days=5&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('forecast unavailable');
    const data = await res.json();
    const days = data.daily;
    if (!days || !days.time) throw new Error('forecast unavailable');

    const dayLabel = (dateStr, i) => {
      if (i === 0) return isHe ? 'היום' : 'Today';
      if (i === 1) return isHe ? 'מחר' : 'Tomorrow';
      return new Date(`${dateStr}T00:00:00`).toLocaleDateString(isHe ? 'he' : 'en', { weekday: 'short' });
    };
    const rows = days.time.slice(0, 5).map((dateStr, i) => `
      <div class="weather-day">
        <span class="weather-day-label">${dayLabel(dateStr, i)}</span>
        <span class="weather-desc">${weatherDescription(days.weathercode[i])}</span>
        <span class="weather-temps"><b>${Math.round(days.temperature_2m_max[i])}${degree}</b> / ${Math.round(days.temperature_2m_min[i])}${degree}</span>
      </div>
    `).join('');

    forecastEl.innerHTML = `
      <p class="combo-label" style="margin-bottom:6px">5-Day Forecast</p>
      ${rows}
      <p class="weather-attribution">Data by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</p>
    `;
  } catch (e) {
    // The forecast is a nice-to-have, not something that should ever block
    // the home page - just drop the forecast portion silently and leave the
    // location picker (which still works) in place.
    forecastEl.innerHTML = '';
  }
}
