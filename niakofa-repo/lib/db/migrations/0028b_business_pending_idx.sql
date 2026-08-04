-- Migration 0028b: business account governance — part 2 of 2
-- Creates the partial index for owner-approval queues.
--
-- This is a separate file from 0028 because the 'pending_owner_approval' enum
-- value added there must be committed before it can be used in a WHERE clause.
-- Running as a normal (transactional) migration is safe here.

CREATE INDEX IF NOT EXISTS help_requests_business_pending_idx
  ON help_requests (business_id, requester_id)
  WHERE status = 'pending_owner_approval';
