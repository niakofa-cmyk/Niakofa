---
name: Niakofa Legacy — Geocoding and Audio Playback
description: How family places get coordinates and how audio assets play back in RPG scenes.
---

# Geocoding and Audio Playback in Legacy Mode

## Geocoding pipeline (added Aug 2026)

**Why:** `family_places` rows are often saved without `lat`/`lng` (user just types a name). The map only renders places with coordinates, so the world stayed empty.

**Fix:**
- `artifacts/api-server/src/lib/geocode.ts` — `geocodePlace(label, country)` tries Nominatim OSM first (free, no key, 5s timeout), then falls back to a hardcoded country centroid table (~80 diaspora-relevant countries). Never throws; returns `{lat, lng, approximate?} | null`.
- `legacy-map.ts` POST route — after inserting a place without coords, fires `geocodePlace()` async (non-blocking); updates the row in background.
- `POST /api/legacy/map/:familyId/places/geocode-missing` — backfill endpoint; processes all coordinateless places for a family; 1.1s delay between Nominatim calls to respect rate limit.
- `legacy-map.tsx` — on load, if `placesWithoutCoordinates > 0`, calls the backfill endpoint once (guarded by `backfillFiredRef`) and re-fetches when done. Shows a "Locating places…" spinner in the stats bar.

**How to apply:** Any new place-save route should call `geocodePlace()` after insert, non-blocking. The backfill endpoint handles historical data.

## Audio playback in RPG scenes (added Aug 2026)

**Why:** `legacy-onboarding.tsx` uses real `MediaRecorder` to record audio and uploads it to `family_memory_assets`. But `legacy-chapter.tsx` only showed the memory text — recordings never played back.

**Fix:**
- `legacy-chapters.ts` `buildChapterScenes()` — now also fetches `familyMemoryAssetsTable` rows (asset_type=audio, status=ready) for chapter memory IDs, resolves presigned/CDN URLs via `getAssetUrl()`, and attaches `audioUrl` to each memory in `vaultContext.memories`.
- `legacy-chapter.tsx` — scene "From the Vault" card now checks `memory.audioUrl`. If present, renders a Play/Pause button with a live waveform animation using a single `<audio>` ref. The ref is paused/reset automatically when scene changes (via `useEffect` on `currentSceneIdx`).

**How to apply:** Any future scene type that needs audio should use the same `audioRef` pattern. The `audioUrl` is already on the memory object from the API.
