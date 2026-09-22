-- Migration 0048: Seed pool_minimum_hourly_rate system setting
--
-- getHourlyMinimumRate() in community-pool.ts already defaults to $15/hr when
-- this row is absent, so existing deployments are unaffected. Seeding it here
-- makes the value visible and tunable in the admin System tab without a code
-- change or a manual psql INSERT.
--
-- $15/hr matches the approximate Texas livable-wage floor used as the default
-- in getHourlyMinimumRate(). Admins can raise this via POST /admin/settings.

INSERT INTO "system_settings" ("key", "value")
VALUES ('pool_minimum_hourly_rate', '15')
ON CONFLICT ("key") DO NOTHING;
