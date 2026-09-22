-- 0009_helper_availability
-- Adds a per-helper weekly availability schedule.
-- Each row is one time window: a day-of-week (0=Sun … 6=Sat) + start/end
-- time stored as minutes-from-midnight (0–1439) so range queries are just
-- integer comparisons and timezone math stays in application code.
--
-- Deliberately separate from the users table:
--   • Helpers can have 0–N windows; a single nullable column on users can't
--     express that.
--   • Replacing all windows for a user is a simple DELETE + INSERT, not a
--     JSON patch on a JSONB column.
--   • The matching engine can JOIN here without pulling the full user row.
--
-- Safe to run on a live DB: CREATE TABLE IF NOT EXISTS, no existing-column
-- mutations, index creation is non-blocking (though without CONCURRENTLY
-- here because this runs inside a migration transaction).

CREATE TABLE IF NOT EXISTS "helper_availability" (
  "id"         serial PRIMARY KEY,
  "user_id"    integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  -- 0 = Sunday, 1 = Monday … 6 = Saturday  (matches JS Date.getDay())
  "day_of_week" smallint NOT NULL CHECK ("day_of_week" BETWEEN 0 AND 6),
  -- Minutes from midnight, 0–1439.  e.g. 9:00 AM = 540, 5:30 PM = 1050.
  "start_min"  smallint NOT NULL CHECK ("start_min" BETWEEN 0 AND 1439),
  "end_min"    smallint NOT NULL CHECK ("end_min"   BETWEEN 1 AND 1440),
  CONSTRAINT "availability_start_before_end" CHECK ("start_min" < "end_min")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helper_availability_user_id_idx"
  ON "helper_availability" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helper_availability_day_idx"
  ON "helper_availability" ("day_of_week");
