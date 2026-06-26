-- Migration 0018: Add system_settings table for persistent app-wide config
--
-- This table holds key/value pairs for global settings. The first use case
-- is the Nia killswitch: "nia_enabled" = "true"/"false". Previously the
-- toggle lived only in nia-service's own migrate.sql (a separate DB boot),
-- so admin-analytics.ts's lazy import of `systemSettings from "@niakofa/db"`
-- was referencing a table that didn't exist in the main API DB — every boot
-- silently fell back to the NIA_ENABLED env var, meaning any toggle set via
-- the admin UI was lost on the next Railway redeploy.
--
-- Both api-server and nia-service connect to the same Postgres instance, so
-- creating it here means both can read/write it.
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the default so the table is never empty on first boot
INSERT INTO system_settings (key, value)
VALUES ('nia_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
