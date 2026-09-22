-- Migration 0015: Phase 13 — is_suspended hard account block
-- Adds suspension columns to users table so the anomaly worker and admins
-- can hard-block accounts without losing approval history.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended      boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at      timestamp,
  ADD COLUMN IF NOT EXISTS suspended_reason  text;

CREATE INDEX IF NOT EXISTS users_is_suspended_idx ON users (is_suspended)
  WHERE is_suspended = true;
