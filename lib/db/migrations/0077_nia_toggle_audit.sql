-- 0077_nia_toggle_audit.sql
--
-- Append-only compliance log for every Nia AI kill-switch toggle.
-- Never updated or deleted — only inserted (see nia-toggle-audit memory note).
-- Inserted transactionally by the admin Nia toggle endpoint whenever the
-- enabled flag changes, so every change has an immutable audit record.

CREATE TABLE IF NOT EXISTS "nia_toggle_audit" (
  "id"            serial PRIMARY KEY,
  "enabled"       boolean NOT NULL,
  "admin_user_id" integer NOT NULL,
  "admin_email"   text    NOT NULL,
  "reason"        text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT NOW()
);

-- Index for time-ordered compliance report queries
CREATE INDEX IF NOT EXISTS "nia_toggle_audit_created_at_idx"
  ON "nia_toggle_audit" ("created_at" DESC);
