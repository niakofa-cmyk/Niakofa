-- 0010_help_chains
-- Adds the request_helpers junction table that lets multiple helpers
-- coordinate on a single request without touching the existing payment
-- and completion model.
--
-- Design decisions:
--   • helper_id on help_requests remains the ONE helper who gets paid,
--     rated, and officially completes the job.  This table is purely
--     additive coordination — think "co-helpers" or "chain members".
--   • A helper can only appear once per request (UNIQUE constraint).
--     Re-joining after leaving is allowed; the unique constraint is on
--     (request_id, helper_id) so any leave→re-join just re-inserts a
--     fresh row.
--   • joined_at is the server timestamp of the join, so the list can be
--     ordered by arrival and displayed as a timeline in the UI.
--   • ON DELETE CASCADE from both sides keeps the table clean when a
--     request is cancelled/deleted or a user account is removed.
--
-- Safe to run live: CREATE TABLE IF NOT EXISTS, no existing-column
-- mutations, non-blocking index creation within the migration transaction.

CREATE TABLE IF NOT EXISTS "request_helpers" (
  "id"          serial PRIMARY KEY,
  "request_id"  integer NOT NULL REFERENCES "help_requests"("id") ON DELETE CASCADE,
  "helper_id"   integer NOT NULL REFERENCES "users"("id")         ON DELETE CASCADE,
  "joined_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "request_helpers_unique" UNIQUE ("request_id", "helper_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_helpers_request_id_idx"
  ON "request_helpers" ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_helpers_helper_id_idx"
  ON "request_helpers" ("helper_id");
