-- Retry-safe request creation.
-- NULL keys remain allowed for older clients; keyed requests are unique per
-- requester so the same operation can be safely replayed after a timeout.
ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS help_requests_requester_client_request_idx
  ON help_requests (requester_id, client_request_id)
  WHERE client_request_id IS NOT NULL;