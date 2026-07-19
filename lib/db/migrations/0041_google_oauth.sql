-- Migration 0041: Google OAuth columns on users table
--
-- google_id: stores the Google "sub" (stable identifier), used to find a user
--   on repeat Google sign-ins without relying on email matching.
-- oauth_provider: tracks which OAuth provider(s) are linked to the account.
--   NULL = email+password only.  'google' = has Google linked.
--   NOT exclusive — email+password and Google can coexist on one account.
--
-- Partial unique index on google_id enforces uniqueness only when the value is
-- NOT NULL, so email-only accounts (NULL) don't conflict with each other.

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx
  ON users(google_id)
  WHERE google_id IS NOT NULL;
