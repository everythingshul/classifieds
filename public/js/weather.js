// Weather data comes from Open-Meteo (https://open-meteo.com), a free
// weather API whose data is licensed CC BY 4.0 - reuse is permitted as long
// as it's attributed, which is why the widget below always links back to
// them. No API key is required and no usage terms are being violated.
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

async function renderWeatherWidget(browserLoc, fallbackLocation) {
  const el = document.getElementById('weatherWidget');
  if (!el) return;
  const lat = browserLoc?.lat ?? fallbackLocation?.lat;
  const lng = browserLoc?.lng ?? fallbackLocation?.lng;
  if (lat === undefined || lng === undefined) return;

  const isHe = I18N.get() === 'he';
  const unit = isHe ? 'celsius' : 'fahrenheit';
  const degree = isHe ? '°C' : '°F';

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&temperature_unit=${unit}&forecast_days=2&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    const days = data.daily;
    if (!days || !days.time) return;

    const labels = isHe ? ['היום', 'מחר'] : ['Today', 'Tomorrow'];
    const rows = days.time.slice(0, 2).map((_, i) => `
      <div class="weather-day">
        <span class="weather-day-label">${labels[i]}</span>
        <span class="weather-desc">${weatherDescription(days.weathercode[i])}</span>
        <span class="weather-temps"><b>${Math.round(days.temperature_2m_max[i])}${degree}</b> / ${Math.round(days.temperature_2m_min[i])}${degree}</span>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="combo-widget weather-widget">
        <p class="combo-label" style="margin-bottom:6px">Weather</p>
        ${rows}
        <p class="weather-attribution">Data by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</p>
      </div>
    `;
  } catch (e) {
    // Silently omit the widget if the forecast can't be fetched - it's a
    // nice-to-have, not something that should ever block the home page.
  }
}
