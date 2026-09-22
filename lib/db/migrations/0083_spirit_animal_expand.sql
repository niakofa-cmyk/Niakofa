-- Migration 0083: Expand spirit_animal accepted values
-- Adds elephant, lion, fish_eagle as selectable Spirit Animal companions.
-- The column is plain text with a CHECK constraint added here.
-- Existing rows stay as 'sankofa_bird' (the column default).

-- Add CHECK constraint if it doesn't already exist
-- (safe to run multiple times — IF NOT EXISTS on the constraint name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_spirit_animal_check'
    AND conrelid = 'user_settings'::regclass
  ) THEN
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_spirit_animal_check
      CHECK (spirit_animal IN (
        'sankofa_bird',
        'black_panther',
        'elephant',
        'lion',
        'fish_eagle'
      ));
  ELSE
    -- Drop old constraint and recreate with expanded values
    ALTER TABLE user_settings
      DROP CONSTRAINT user_settings_spirit_animal_check;
    ALTER TABLE user_settings
      ADD CONSTRAINT user_settings_spirit_animal_check
      CHECK (spirit_animal IN (
        'sankofa_bird',
        'black_panther',
        'elephant',
        'lion',
        'fish_eagle'
      ));
  END IF;
END $$;
