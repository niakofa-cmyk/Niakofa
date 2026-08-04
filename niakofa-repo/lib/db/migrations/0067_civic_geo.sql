-- Community Map Backend Geo: add map-plottable coordinates to civic
-- resources (food pantries, shelters, legal aid) and civic needs
-- (county/gov-sponsor posted needs), so the requester community map can
-- place pins for both alongside the existing helpers/online locations.
--
-- Additive only — existing /civic/resources (region match) and
-- /civic/needs (status browse) callers are unaffected; new columns are
-- nullable and new /civic/resources/nearby + /civic/needs/nearby routes
-- filter to rows where coordinates are already resolved.

ALTER TABLE "civic_resources" ADD COLUMN IF NOT EXISTS "address" text;
ALTER TABLE "civic_resources" ADD COLUMN IF NOT EXISTS "latitude" real;
ALTER TABLE "civic_resources" ADD COLUMN IF NOT EXISTS "longitude" real;
ALTER TABLE "civic_resources" ADD COLUMN IF NOT EXISTS "open_hours" text;

CREATE INDEX IF NOT EXISTS "idx_civic_resources_geo" ON "civic_resources" ("latitude", "longitude");
CREATE INDEX IF NOT EXISTS "idx_civic_resources_category" ON "civic_resources" ("category");

ALTER TABLE "civic_needs" ADD COLUMN IF NOT EXISTS "lat" real;
ALTER TABLE "civic_needs" ADD COLUMN IF NOT EXISTS "lng" real;

CREATE INDEX IF NOT EXISTS "idx_civic_needs_geo" ON "civic_needs" ("lat", "lng");
