-- Migration 0017: Add preferred_language to user_settings
-- The Settings screen's language picker (LanguageSelector + culturalGreetings.ts)
-- has been calling PUT /users/:id/settings with { preferred_language } since
-- Phase 7b, but no such column existed on user_settings -- the server's
-- `allowed` whitelist silently dropped the field on every save, so the
-- preference never persisted. This adds the column and backfills existing
-- rows to 'en' (the app's default before this fix).
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';
