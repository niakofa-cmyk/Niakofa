-- Migration 0026: pledge_status write-off path
-- Adds pledge_status to help_requests so stale unpaid pledges can be
-- marked forgiven or written_off instead of hanging in the runway number forever.
-- Values: active (default) | forgiven | written_off
-- See document notes: "Write-off path for stale pledges" — Priority #1

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS pledge_status text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS help_requests_pledge_status_idx
  ON help_requests (pledge_status, created_at);
