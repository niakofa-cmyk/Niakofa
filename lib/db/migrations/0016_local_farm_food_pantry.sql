-- Migration 0016: Add local_farm and food_pantry to help_request_category enum
-- Frontend (request-new.tsx, recurring.tsx, i18n.ts) already accepts these
-- categories, but the DB enum was never updated to match -- any request
-- submitted with category=local_farm or category=food_pantry fails at
-- insert time. This brings the enum in sync.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block alongside
-- other statements, so each value is added on its own.
ALTER TYPE help_request_category ADD VALUE IF NOT EXISTS 'local_farm';
ALTER TYPE help_request_category ADD VALUE IF NOT EXISTS 'food_pantry';
