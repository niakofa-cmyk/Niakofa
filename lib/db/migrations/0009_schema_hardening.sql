-- Migration 0009: Schema hardening
-- Adds DB-level constraints that enforce valid values and prevent duplicate rows.
-- Safe to run on an existing database — all constraints use IF NOT EXISTS or
-- DO $$ ... IF NOT EXISTS patterns; the timestamptz change is additive.

-- 1. crisis_state: enforce valid level values
--    Prevents typos like "critcal" silently entering the table.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'crisis_level_values' AND conrelid = 'crisis_state'::regclass
  ) THEN
    ALTER TABLE crisis_state
      ADD CONSTRAINT crisis_level_values
      CHECK (level IN ('info', 'warning', 'critical'));
  END IF;
END $$;

-- 2. helper_availability: composite unique prevents double-booking the same
--    (user, day, start) slot from a race condition or double-submit.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'helper_availability_user_day_start_uidx'
      AND conrelid = 'helper_availability'::regclass
  ) THEN
    ALTER TABLE helper_availability
      ADD CONSTRAINT helper_availability_user_day_start_uidx
      UNIQUE (user_id, day_of_week, start_min);
  END IF;
END $$;

-- 3. crisis_state.created_at: align live column type with Drizzle schema.
--    The schema uses timestamp({ withTimezone: true }) → timestamptz, but the
--    column was originally created as plain timestamp without time zone.
--    On any already-provisioned database this is silent schema drift: Drizzle
--    ORM assumes timestamptz while pg stores a tz-naive value. The USING clause
--    reinterprets existing values as UTC (pg's storage default) before casting.
DO $$ BEGIN
  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'crisis_state'
      AND column_name = 'created_at'
      AND table_schema = current_schema()
  ) = 'timestamp without time zone' THEN
    ALTER TABLE crisis_state
      ALTER COLUMN created_at TYPE timestamptz
      USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;
