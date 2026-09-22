---
name: Niakofa address geocoding search
description: request-new.tsx has a Mapbox geocoding text input above the pin map so users can type an address instead of only drag-pinning.
---

# Address geocoding search in request-new.tsx

**Why:** Users had no way to type an address — the only way to set location was dragging a map pin, which is imprecise and unusable on keyboard-primary devices.

**How it works:**
- Debounced (400ms) fetch to `https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json` using `VITE_MAPBOX_TOKEN`.
- Proximity biased toward current `pinLocation ?? myLocation ?? ipMapCenter`.
- Suggestion dropdown (onMouseDown to avoid blur race) calls `handleSelectAddress` → `setPinLocation` + `mapRef.current?.flyTo()`.
- `MapboxMap` given a `ref={mapRef}` (type `MapRef` from react-map-gl/mapbox).

**How to apply:** Always add `ref={mapRef}` to any MapboxMap that needs imperative camera control from outside.
