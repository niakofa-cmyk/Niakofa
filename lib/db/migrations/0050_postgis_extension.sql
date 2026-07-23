-- Migration: ensure PostGIS extension exists before any geography columns are used.
-- This must run first on a fresh database (before 0000) so that
-- geography(Point, 4326) columns in the schema don't fail with
-- "type geography does not exist".
-- Safe to re-run: CREATE EXTENSION IF NOT EXISTS is idempotent.
-- NOTE: this file intentionally has no -- no-transaction header because
-- CREATE EXTENSION must run outside a transaction on some PG versions.
CREATE EXTENSION IF NOT EXISTS postgis;
