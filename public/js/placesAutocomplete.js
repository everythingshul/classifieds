let _placesLoading = null;
function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.resolve(false);
  if (window.google?.maps) return Promise.resolve(true);
  if (_placesLoading) return _placesLoading;
  _placesLoading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => { console.error('[maps] Failed to load the Google Maps script - check that the API key is correct and unrestricted for this domain.'); resolve(false); };
    document.head.appendChild(script);
  });
  return _placesLoading;
}

function addressComponentsFrom(place) {
  let city = '', state = '';
  (place.addressComponents || place.address_components || []).forEach((c) => {
    const types = c.types || [];
    if (types.includes('locality')) city = c.longText || c.long_name;
    if (!city && types.includes('postal_town')) city = c.longText || c.long_name;
    if (types.includes('administrative_area_level_1')) state = c.shortText || c.short_name;
  });
  return { city, state };
}

// Uses the new (2025+) Places "Autocomplete Data API" - a headless,
// non-deprecated API that returns suggestion data without owning the
// input's DOM, so we can render our own dropdown over the existing plain
// <input> instead of swapping it for Google's custom element. This is the
// path new Google Cloud projects/keys must use, since the older
// google.maps.places.Autocomplete widget (see tryLegacyAutocomplete below)
// was blocked for new customers starting March 2025.
async function tryNewAutocomplete(inputEl, { onSelect }) {
  const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places');
  if (!AutocompleteSuggestion) return false;

  const box = document.createElement('ul');
  box.className = 'places-suggestions';
  box.style.display = 'none';
  const wrap = inputEl.parentElement;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  wrap.appendChild(box);

  let token = new AutocompleteSessionToken();
  let debounceTimer = null;
  let activeSuggestions = [];

  function hide() { box.style.display = 'none'; box.innerHTML = ''; }

  async function search(value) {
    if (!value || value.length < 3) return hide();
    let result;
    try {
      result = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, sessionToken: token });
    } catch (e) {
      console.error('[maps] Autocomplete suggestion fetch failed - check that "Places API (New)" is enabled and billing is active on the Google Cloud project.', e);
      return hide();
    }
    activeSuggestions = (result?.suggestions || []).filter((s) => s.placePrediction);
    if (!activeSuggestions.length) return hide();
    box.innerHTML = activeSuggestions.map((s, i) => `<li data-i="${i}">${s.placePrediction.text.toString()}</li>`).join('');
    box.style.display = 'block';
  }

  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(inputEl.value.trim()), 300);
  });
  inputEl.addEventListener('blur', () => setTimeout(hide, 150));

  box.addEventListener('mousedown', async (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    e.preventDefault();
    const suggestion = activeSuggestions[Number(li.dataset.i)];
    if (!suggestion) return;
    const place = suggestion.placePrediction.toPlace();
    try {
      await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });
    } catch (e2) {
      console.error('[maps] Failed to fetch place details for the selected suggestion.', e2);
      hide();
      return;
    }
    inputEl.value = place.formattedAddress || inputEl.value;
    const { city, state } = addressComponentsFrom(place);
    onSelect?.({
      text: place.formattedAddress || inputEl.value,
      lat: place.location?.lat?.(),
      lng: place.location?.lng?.(),
      placeId: place.id,
      city, state,
    });
    token = new AutocompleteSessionToken();
    hide();
  });

  return true;
}

// Older Google Cloud projects/keys (created before March 2025) can still use
// this widget. Kept as a fallback for accounts where it still works, or
// where "Places API (New)" isn't enabled but the classic "Places API" is.
async function tryLegacyAutocomplete(inputEl, { onSelect }) {
  if (!window.google?.maps?.places?.Autocomplete) return false;
  try {
    const ac = new google.maps.places.Autocomplete(inputEl, { types: ['geocode'] });
    ac.addListener('place_changed', () => {
      const place = ac.getPlace();
      if (!place || !place.geometry) return;
      const { city, state } = addressComponentsFrom(place);
      onSelect?.({
        text: place.formatted_address || inputEl.value,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        placeId: place.place_id,
        city, state,
      });
    });
    return true;
  } catch (e) {
    console.error('[maps] The classic Places Autocomplete widget failed to initialize. As of March 2025 Google blocks this widget for newly-created API keys/projects - if this site\'s Google Maps key is new, that\'s the likely cause. The location field still works for manual typing either way.', e);
    return false;
  }
}

// Attaches address autocomplete to a plain text input when a Maps API key is
// configured. Falls back silently to plain manual text entry otherwise (or
// if both Places API paths fail) - the location field always works either
// way, autocomplete is just a convenience.
async function attachLocationAutocomplete(inputEl, { onSelect } = {}) {
  const apiKey = window.SITE_CONFIG?.googleMapsApiKey;
  if (!apiKey) {
    console.warn('[maps] No Google Maps API key is configured (Admin -> Settings -> Maps) - address autocomplete is disabled, manual location entry still works.');
    return;
  }
  const ok = await loadGoogleMaps(apiKey);
  if (!ok || !window.google?.maps) return;

  let attached = false;
  try {
    attached = await tryNewAutocomplete(inputEl, { onSelect });
  } catch (e) {
    console.error('[maps] New Places Autocomplete Data API unavailable, will try the legacy widget instead.', e);
  }
  if (!attached) await tryLegacyAutocomplete(inputEl, { onSelect });
}
