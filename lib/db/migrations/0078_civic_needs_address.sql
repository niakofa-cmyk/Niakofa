-- 0078_civic_needs_address.sql
--
-- Add address column to civic_needs table.
-- Stores the human-readable geocoded address alongside lat/lng.
-- Populated lazily by resolveNeedCoords() in civic.ts and persisted
-- so geocoding only runs once per need. Null until first resolved.
-- Needed because GET /civic/needs/:id now selects civicNeedsTable.address
-- (see lib/db/src/schema/civic-needs.ts for the matching schema column).

ALTER TABLE "civic_needs"
  ADD COLUMN IF NOT EXISTS "address" text;
