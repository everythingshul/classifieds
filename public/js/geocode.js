// Turns a typed zip code or city name into {lat, lng, label} for the zmanim
// and weather widgets. Primary path is Google Places (New) via the same
// attachLocationAutocomplete() used on post-wizard location fields - see
// initLocationPicker() below. When no Google Maps API key is configured,
// geocodeZipOrCity() is used as a manual fallback instead: US zip codes go
// through Zippopotam.us, anything else through Open-Meteo's free geocoding
// API - no key needed either way, so the picker always works.
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

// Default location when the browser's geolocation isn't available/granted
// and no custom location has been picked - jlistings.co.uk (and any other
// .co.uk domain this app serves) defaults to London instead of Brooklyn.
const CLIENT_DEFAULT_LOCATIONS = {
  brooklyn: { label: 'Brooklyn, NY', lat: 40.6782, lng: -73.9442, tzid: 'America/New_York' },
  london: { label: 'London, UK', lat: 51.5072, lng: -0.1276, tzid: 'Europe/London' },
};
function domainDefaultLocation() {
  return /\.co\.uk$/i.test(location.hostname) ? CLIENT_DEFAULT_LOCATIONS.london : CLIENT_DEFAULT_LOCATIONS.brooklyn;
}

const LOCATION_PIN_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 6.3 12.3 6.57 12.6a.58.58 0 0 0 .86 0C12.7 21.3 19 14.25 19 9c0-3.86-3.14-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

// Shared "change location" chip + popover, used independently by the zmanim
// card and the weather widget (each with its own storageKey, so picking a
// location for one never touches the other). root.innerHTML is fully owned
// by this function; call it again any time label/isDefault/tzid change.
function initLocationPicker({ root, storageKey, label, isDefault, tzid, onChange }) {
  root.innerHTML = `
    <div class="loc-picker">
      <button type="button" class="loc-chip" aria-expanded="false">
        <span class="loc-chip-row">
          ${LOCATION_PIN_ICON}
          <span class="loc-chip-label">${escapeHtml(label)}</span>
          ${isDefault ? '<span class="loc-chip-badge">default</span>' : ''}
        </span>
        ${tzid ? `<span class="loc-chip-tz">${escapeHtml(tzid)}</span>` : ''}
      </button>
      <div class="loc-popover" hidden>
        <form class="loc-popover-form" autocomplete="off">
          <input type="text" placeholder="Search city or zip code">
          <button type="submit" class="loc-popover-go" aria-label="Search">&rarr;</button>
        </form>
        <button type="button" class="loc-popover-mylocation">${LOCATION_PIN_ICON} Use my current location</button>
      </div>
    </div>
  `;

  const chipBtn = root.querySelector('.loc-chip');
  const popover = root.querySelector('.loc-popover');
  const input = root.querySelector('.loc-popover-form input');
  const form = root.querySelector('.loc-popover-form');
  const myLocBtn = root.querySelector('.loc-popover-mylocation');

  function outsideClick(e) {
    if (!root.contains(e.target)) closePopover();
  }

  function closePopover() {
    popover.setAttribute('hidden', '');
    chipBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outsideClick);
  }

  function openPopover() {
    popover.removeAttribute('hidden');
    chipBtn.setAttribute('aria-expanded', 'true');
    input.focus();
    document.addEventListener('click', outsideClick);
  }

  chipBtn.addEventListener('click', () => {
    if (popover.hasAttribute('hidden')) openPopover();
    else closePopover();
  });

  function pick(result) {
    if (result.lat === undefined || result.lng === undefined) return;
    localStorage.setItem(storageKey, JSON.stringify(result));
    closePopover();
    onChange(result);
  }

  attachLocationAutocomplete(input, {
    onSelect: (sel) => {
      const place = sel.city ? (sel.state ? `${sel.city}, ${sel.state}` : sel.city) : sel.text;
      pick({ lat: sel.lat, lng: sel.lng, label: place || sel.text });
    },
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const goBtn = form.querySelector('.loc-popover-go');
    input.disabled = true;
    goBtn.disabled = true;
    const result = await geocodeZipOrCity(q);
    input.disabled = false;
    goBtn.disabled = false;
    if (!result) {
      toast("Couldn't find that location - try a zip code or city name.");
      return;
    }
    pick(result);
  });

  myLocBtn.addEventListener('click', () => {
    localStorage.removeItem(storageKey);
    closePopover();
    onChange(null);
  });
}
