-- Migration 0031: seed businesses_enabled system setting
-- The businesses_enabled flag gates the business-account feature globally.
-- Seeding it here ensures fresh DBs have the feature on by default without
-- requiring a manual admin toggle. Uses ON CONFLICT DO NOTHING so it is
-- safe to run against a DB that already has the key set by an admin.
INSERT INTO system_settings (key, value)
VALUES ('businesses_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
