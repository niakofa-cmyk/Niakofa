---
name: Niakofa map clustering and heatmap
description: How request-pin clustering and demand heatmap are wired in map.tsx; critical constraints to avoid duplicate markers.
---

## Cluster setup
- `CLUSTER_MAX_ZOOM = 12` — below this zoom, Mapbox groups request pins into cluster bubbles. Above it, individual React `<Marker>` components render instead.
- `showIndividualMarkers = mapZoom > CLUSTER_MAX_ZOOM` — the single gate that prevents duplicate markers. Both the cluster `<Source>` and individual `<Marker>` components are mounted, but markers are hidden at low zoom via this boolean.
- Cluster bubble color steps: green (1–4), yellow (5–14), red (15+).
- Cluster `<Source>` uses `cluster={true} clusterMaxZoom={12} clusterRadius={55}`.
- `mapZoom` is tracked via the `onZoom` prop on the `<Map>` component (not via the raw Mapbox event).

## Heatmap setup
- Rendered as a separate `<Source id="heatmap-source">` + `<Layer type="heatmap">`, mounted only when `showHeatmap && openRequests.length > 0`.
- Uses the same `requestsGeoJSON` memo as the cluster source.
- **Order matters**: heatmap `<Source>` must appear BEFORE the cluster `<Source>` in JSX so Mapbox renders it underneath the cluster bubbles.
- Emergency requests weighted 3× in `heatmap-weight` expression.

## Off-center / recenter
- `isOffCenter` state flipped via the raw Mapbox `moveend` event (registered in `handleMapLoad`), not via react-map-gl's `onMove` prop — avoids excessive state updates during drag.
- `recenterOnMe` reads `myLocationRef.current ?? ipFallbackRef.current` (stable refs, not stale closure values).
- Recenter button only shown when `isOffCenter && (myLocation ?? ipFallback)`.

## Auto-recenter on first GPS fix
- `hadInitialGps` and `hasAutoRecenteredOnGps` refs prevent repeated recenters.
- `useEffect` watching `myLocation` calls `mapRef.current?.flyTo(...)` when the GPS signal arrives for the first time after an IP-fallback start.

**Why:** Without `showIndividualMarkers` gating, both cluster layer circles AND React Marker components would render at low zoom, producing duplicate/stacked pins.
