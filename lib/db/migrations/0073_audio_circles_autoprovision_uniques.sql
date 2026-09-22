-- Migration 0073: Audio Circles auto-provisioning uniqueness
--
-- ROOT CAUSE OF "CIRCLES DISAPPEAR" ------------------------------------------
-- Migration 0064 seeded audio_circles rows for Fort Worth ONLY, as a
-- one-time INSERT. No code path anywhere in the app ever inserted an
-- audio_circles row after that. GET /api/audio-circles is a pure read —
-- it never creates circles for a city.
--
-- city_neighborhoods, by contrast, DOES self-provision: the first time
-- anyone requests a city that isn't Fort Worth, GET /community/neighborhoods
-- generates and caches neighborhoods for it. Audio Circles never got the
-- same treatment.
--
-- Net effect: any user whose city isn't literally "Fort Worth" (i.e. almost
-- everyone) sees "No circles yet for {city}" every single time — forever —
-- while the Fort Worth default flashes real content only because of that
-- one migration. That reads exactly like "circles disappeared" once a user's
-- real city/location kicks in and replaces the Fort Worth fallback, or once
-- Fort Worth's own migration failed to run in a given environment.
--
-- This migration adds the two partial-unique indexes the accompanying route
-- patch (routes/audio-circles.ts, routes/community-neighborhoods.ts) needs
-- to safely auto-provision circles on read via ON CONFLICT DO NOTHING —
-- making circle creation race-safe under concurrent requests, instead of
-- relying on a SELECT-then-INSERT NOT EXISTS check (migration 0064's
-- pattern) which has a race window between two simultaneous requests for a
-- brand-new city.
--
-- Idempotent — safe to re-run (see CLAUDE.md Incident #2).

-- Defensive cleanup FIRST: if any environment's migration 0064 partially ran
-- twice before these indexes existed, collapse duplicates before the unique
-- indexes below are enforced (CREATE UNIQUE INDEX fails on pre-existing
-- dupes). No-op on a clean database. Keeps the lowest id (oldest row) of
-- each set -- never deletes the only copy, only exact-duplicate extras.
DELETE FROM audio_circles a
USING audio_circles b
WHERE a.id > b.id
  AND a.neighborhood_id IS NOT NULL
  AND a.neighborhood_id = b.neighborhood_id;

DELETE FROM audio_circles a
USING audio_circles b
WHERE a.id > b.id
  AND a.neighborhood_id IS NULL
  AND b.neighborhood_id IS NULL
  AND a.city_key = b.city_key;

-- One circle per neighborhood.
CREATE UNIQUE INDEX IF NOT EXISTS audio_circles_neighborhood_uniq
  ON audio_circles (neighborhood_id)
  WHERE neighborhood_id IS NOT NULL;

-- Exactly one city-wide circle (neighborhood_id IS NULL) per city_key.
CREATE UNIQUE INDEX IF NOT EXISTS audio_circles_citywide_uniq
  ON audio_circles (city_key)
  WHERE neighborhood_id IS NULL;
