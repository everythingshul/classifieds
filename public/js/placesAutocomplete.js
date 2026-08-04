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

function addressComponentsFrom(components) {
  let city = '', state = '';
  (components || []).forEach((c) => {
    const types = c.types || [];
    if (types.includes('locality')) city = c.longText || c.long_name;
    if (!city && types.includes('postal_town')) city = c.longText || c.long_name;
    if (types.includes('administrative_area_level_1')) state = c.shortText || c.short_name;
  });
  return { city, state };
}

// Shared dropdown UI: renders a suggestions list under inputEl, debounces
// input, and hands off the picked item to onPick. Both autocomplete paths
// below use this so the actual DOM/UX wiring is only written once.
function mountSuggestionsDropdown(inputEl, { fetchSuggestions, onPick }) {
  const box = document.createElement('ul');
  box.className = 'places-suggestions';
  box.style.display = 'none';
  const wrap = inputEl.parentElement;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  wrap.appendChild(box);

  let debounceTimer = null;
  let activeItems = [];

  function hide() { box.style.display = 'none'; box.innerHTML = ''; }

  async function search(value) {
    if (!value || value.length < 3) return hide();
    let items;
    try {
      items = await fetchSuggestions(value);
    } catch (e) {
      console.error('[maps] Autocomplete suggestion fetch failed.', e);
      return hide();
    }
    activeItems = items || [];
    if (!activeItems.length) return hide();
    box.innerHTML = activeItems.map((it, i) => `<li data-i="${i}">${it.label}</li>`).join('');
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
    const item = activeItems[Number(li.dataset.i)];
    hide();
    if (item) await onPick(item);
  });
}

// Uses the new (2025+) Places "Autocomplete Data API" - a headless,
// non-deprecated API that returns suggestion data without owning the
// input's DOM. This is the path new Google Cloud projects/keys must use,
// since the classic google.maps.places.Autocomplete *widget* was blocked
// for new customers starting March 2025 (see tryLegacyAutocomplete below,
// which uses the still-unrestricted AutocompleteService instead of that
// widget).
async function tryNewAutocomplete(inputEl, { onSelect }) {
  const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places');
  if (!AutocompleteSuggestion) return false;

  // A cheap real-use check up front, rather than only discovering at the
  // user's first keystroke that this path is silently non-functional.
  await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: 'a', sessionToken: new AutocompleteSessionToken() });

  let token = new AutocompleteSessionToken();
  mountSuggestionsDropdown(inputEl, {
    fetchSuggestions: async (value) => {
      const result = await AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: value, sessionToken: token });
      return (result?.suggestions || [])
        .filter((s) => s.placePrediction)
        .map((s) => ({ label: s.placePrediction.text.toString(), suggestion: s }));
    },
    onPick: async (item) => {
      const place = item.suggestion.placePrediction.toPlace();
      try {
        await place.fetchFields({ fields: ['formattedAddress', 'location', 'addressComponents'] });
      } catch (e) {
        console.error('[maps] Failed to fetch place details for the selected suggestion.', e);
        return;
      }
      inputEl.value = place.formattedAddress || inputEl.value;
      const { city, state } = addressComponentsFrom(place.addressComponents);
      onSelect?.({
        text: place.formattedAddress || inputEl.value,
        lat: place.location?.lat?.(),
        lng: place.location?.lng?.(),
        placeId: place.id,
        city, state,
      });
      token = new AutocompleteSessionToken();
    },
  });
  return true;
}

// AutocompleteService + PlacesService are the older, non-UI prediction/
// details classes - unlike the classic Autocomplete *widget*, Google never
// blocked these for new customers, so they're a real fallback (not just a
// silent no-op) for projects that only have the classic "Places API"
// enabled rather than "Places API (New)".
async function tryLegacyAutocomplete(inputEl, { onSelect }) {
  // With `loading=async` on the bootstrap script, simply having
  // `&libraries=places` in the URL doesn't reliably attach the places
  // classes anymore - each library needs its own importLibrary() call.
  // Without this, google.maps.places can still be undefined here even
  // after the base script has loaded, which looked like "AutocompleteService
  // not available" regardless of what's actually enabled on the account.
  try {
    await google.maps.importLibrary('places');
  } catch (e) {
    // Fall through to the same not-available check below - if the import
    // itself fails, there's nothing this path can do either.
  }
  if (!window.google?.maps?.places?.AutocompleteService) return false;
  const service = new google.maps.places.AutocompleteService();
  const placesService = new google.maps.places.PlacesService(document.createElement('div'));

  // A real functional check up front - confirms Google actually returns
  // results for this key/project instead of just that the classes exist.
  await new Promise((resolve, reject) => {
    service.getPlacePredictions({ input: 'a' }, (predictions, status) => {
      if (status === 'OK' || status === 'ZERO_RESULTS') return resolve();
      reject(new Error(`Legacy Places Autocomplete Service status: ${status}`));
    });
  });

  mountSuggestionsDropdown(inputEl, {
    fetchSuggestions: (value) => new Promise((resolve, reject) => {
      service.getPlacePredictions({ input: value }, (predictions, status) => {
        if (status === 'ZERO_RESULTS') return resolve([]);
        if (status !== 'OK' || !predictions) return reject(new Error(`status: ${status}`));
        resolve(predictions.map((p) => ({ label: p.description, prediction: p })));
      });
    }),
    onPick: (item) => new Promise((resolve) => {
      placesService.getDetails({ placeId: item.prediction.place_id, fields: ['formatted_address', 'geometry', 'address_components'] }, (place, status) => {
        if (status !== 'OK' || !place) return resolve();
        inputEl.value = place.formatted_address || inputEl.value;
        const { city, state } = addressComponentsFrom(place.address_components);
        onSelect?.({
          text: place.formatted_address || inputEl.value,
          lat: place.geometry?.location?.lat?.(),
          lng: place.geometry?.location?.lng?.(),
          placeId: item.prediction.place_id,
          city, state,
        });
        resolve();
      });
    }),
  });
  return true;
}

// Attaches address autocomplete to a plain text input when a Maps API key is
// configured. Falls back silently to plain manual text entry otherwise (or
// if both Places API paths fail) - the location field always works either
// way, autocomplete is just a convenience. Returns a status object (rather
// than throwing/swallowing) so callers - including the Admin Settings "Test
// Maps API" button - can report exactly what happened using this same,
// real code path instead of a separate check that could drift out of sync.
async function attachLocationAutocomplete(inputEl, { onSelect } = {}) {
  const apiKey = window.SITE_CONFIG?.googleMapsApiKey;
  if (!apiKey) {
    const msg = 'No Google Maps API key is configured (Admin -> Settings -> Maps) - address autocomplete is disabled, manual location entry still works.';
    console.warn(`[maps] ${msg}`);
    return { ok: false, error: msg };
  }
  const ok = await loadGoogleMaps(apiKey);
  if (!ok || !window.google?.maps) {
    const msg = 'The Google Maps script failed to load - check the key is correct and not blocked by HTTP referrer restrictions for this domain.';
    return { ok: false, error: msg };
  }

  try {
    if (await tryNewAutocomplete(inputEl, { onSelect })) return { ok: true, api: 'new (Autocomplete Data API)' };
  } catch (e) {
    console.warn('[maps] New Places Autocomplete Data API unavailable, trying the legacy AutocompleteService instead.', e.message);
  }
  try {
    if (await tryLegacyAutocomplete(inputEl, { onSelect })) return { ok: true, api: 'legacy (AutocompleteService)' };
    throw new Error('AutocompleteService not available on window.google.maps.places');
  } catch (e) {
    const msg = `Both the new and legacy Places Autocomplete paths failed (${e.message}) - check that a Places product ("Places API" or "Places API (New)") is enabled and billing is active on the Google Cloud project for this key, and that the key isn't restricted away from this domain. Manual location entry still works.`;
    console.error(`[maps] ${msg}`);
    return { ok: false, error: msg };
  }
}
