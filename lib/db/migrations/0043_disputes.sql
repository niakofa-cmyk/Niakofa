-- Migration 0043: dispute resolution system
-- Closes the structural gap identified in multiple audit rounds:
-- "Dispute resolution — there's still no dispute logic anywhere in routes/lib.
--  This remains the one structural gap I'd flag as genuinely missing."
--
-- Design decisions:
--   1. opened_by = the user who filed the dispute (requester OR helper)
--   2. against_user = the other party (can be null if about the platform/request itself)
--   3. Atomic status transitions enforced at the application layer (routes/disputes.ts)
--   4. resolved_by / resolved_at record admin accountability
--   5. No auto-escalation — admins drive all state changes (keeps it simple for v1)

CREATE TABLE IF NOT EXISTS disputes (
  id                  SERIAL PRIMARY KEY,
  request_id          INTEGER NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  opened_by           INTEGER NOT NULL REFERENCES users(id),
  against_user        INTEGER REFERENCES users(id),
  reason              TEXT NOT NULL,
  details             TEXT,
  -- Status lifecycle: open → under_review → resolved | dismissed
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
  resolution          TEXT,
  resolved_by         INTEGER REFERENCES users(id),
  resolved_at         TIMESTAMP WITH TIME ZONE,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for admin queue (most common query: fetch open/under_review disputes newest first)
CREATE INDEX IF NOT EXISTS disputes_status_created_idx
  ON disputes (status, created_at DESC);

-- Index for user-facing "my disputes" view
CREATE INDEX IF NOT EXISTS disputes_opened_by_idx
  ON disputes (opened_by, created_at DESC);

-- Prevent the same user from filing multiple disputes on the same request
-- (they can update their existing one instead). Partial index on non-resolved.
CREATE UNIQUE INDEX IF NOT EXISTS disputes_one_active_per_user_request
  ON disputes (request_id, opened_by)
  WHERE status IN ('open', 'under_review');
