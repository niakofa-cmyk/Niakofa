-- Migration 0028: business account governance
-- Adds per-member spending cap and owner-approval workflow for business requests.

-- Per-member spending cap in cents. NULL means no cap (default for existing members).
-- updated_at tracks cap changes for audit purposes.
ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS spending_cap_cents integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- A business request posted by staff waits in 'pending_owner_approval' before
-- going live. The existing status column already uses free-form text, so we can
-- add this value without a check constraint change. We add a partial index so
-- owner-approval queues are fast and scoped to a business.
CREATE INDEX IF NOT EXISTS help_requests_business_pending_idx
  ON help_requests (business_id, requester_id)
  WHERE status = 'pending_owner_approval';
