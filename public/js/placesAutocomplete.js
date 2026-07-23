let _placesLoading = null;
function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (_placesLoading) return _placesLoading;
  _placesLoading = new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return _placesLoading;
}

// Attaches Google Places Autocomplete to a text input when a Maps API key is
// configured. Falls back silently to plain manual text entry otherwise - the
// location field always works either way, autocomplete is just a convenience.
async function attachLocationAutocomplete(inputEl, { onSelect } = {}) {
  const apiKey = window.SITE_CONFIG?.googleMapsApiKey;
  const ok = await loadGoogleMaps(apiKey);
  if (!ok || !window.google?.maps?.places) return;
  const ac = new google.maps.places.Autocomplete(inputEl, { types: ['geocode'] });
  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (!place || !place.geometry) return;
    let city = '', state = '';
    (place.address_components || []).forEach((c) => {
      if (c.types.includes('locality')) city = c.long_name;
      if (!city && c.types.includes('postal_town')) city = c.long_name;
      if (c.types.includes('administrative_area_level_1')) state = c.short_name;
    });
    onSelect?.({
      text: place.formatted_address || inputEl.value,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      placeId: place.place_id,
      city, state,
    });
  });
}
