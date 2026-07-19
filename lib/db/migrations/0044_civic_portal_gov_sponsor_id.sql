-- Migration 0044: civic portal — add government_sponsor_id to help_requests
--
-- Closes the deployment-blocking gap introduced alongside the civic portal
-- feature: the requestsTable schema declared government_sponsor_id but no
-- migration ever wrote the column to the actual database. Without this,
-- every POST /civic/portal/requests would fail with
--   column "government_sponsor_id" does not exist
-- the first time it hit a real DB — the same class of bug as Incident #28
-- (photo_url column, migration never written).
--
-- Pattern mirrors migration 0027 (business_id):
--   ADD COLUMN IF NOT EXISTS — fully idempotent
--   ON DELETE SET NULL        — if a gov-sponsor row is deleted, requests
--                               keep their data; they just lose the FK link
--   INDEX on the FK column    — admin "all civic requests" query filters on this

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS government_sponsor_id integer
    REFERENCES government_sponsors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS help_requests_government_sponsor_id_idx
  ON help_requests (government_sponsor_id);
