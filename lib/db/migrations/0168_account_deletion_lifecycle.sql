-- Account deletion requests are retained as a lifecycle state so the API can
-- anonymize personal data immediately without destroying community, moderation,
-- or financial records that are still legally or operationally required.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deletion_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

UPDATE users
SET deletion_status = 'active'
WHERE deletion_status IS NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_deletion_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_deletion_status_check
  CHECK (deletion_status IN ('active', 'pending_purge', 'purged'));

CREATE INDEX IF NOT EXISTS users_deletion_schedule_idx
  ON users(deletion_status, deletion_scheduled_at)
  WHERE deletion_status = 'pending_purge';