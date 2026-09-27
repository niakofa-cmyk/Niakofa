-- Default to the accessible, low-cost blue location puck while allowing
-- members to opt into their Spirit Animal companion.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS location_marker_style text NOT NULL DEFAULT 'puck';

UPDATE user_settings
SET location_marker_style = 'puck'
WHERE location_marker_style IS NULL
   OR location_marker_style NOT IN ('puck', 'spirit');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_settings_location_marker_style_check'
      AND conrelid = 'user_settings'::regclass
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_location_marker_style_check
      CHECK (location_marker_style IN ('puck', 'spirit'));
  END IF;
END $$;