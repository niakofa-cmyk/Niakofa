-- 0076_nia_toggle_audit.sql
--
-- Creates the nia_toggle_audit table — append-only paper trail of every
-- Nia AI kill-switch change. Required for legal/compliance: admins need a
-- verifiable record of who enabled/disabled Nia, when, and why.
-- Never updated or deleted; only inserted. Safe to run multiple times
-- (uses IF NOT EXISTS / DO NOTHING guards).

CREATE TABLE IF NOT EXISTS "nia_toggle_audit" (
  "id" serial PRIMARY KEY,
  "enabled" boolean NOT NULL,
  "admin_user_id" integer NOT NULL,
  "admin_email" text NOT NULL,
  "reason" text,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
