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
