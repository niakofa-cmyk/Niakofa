-- Migration 0079: Add spirit_animal to user_settings
-- Introduces the Black Panther as the second selectable Spirit Animal
-- companion (the Sankofa Bird was the only option until now, hardcoded
-- into every SankofaBird render site). Defaults existing rows to
-- 'sankofa_bird' so no one's map avatar changes on deploy.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS spirit_animal text NOT NULL DEFAULT 'sankofa_bird';
