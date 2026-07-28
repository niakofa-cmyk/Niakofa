-- Migration 0059: no_show_count on users
-- Tracks how many times a helper has claimed a request then released/abandoned it
-- without completing it. Incremented atomically in the /requests/:id/cancel endpoint
-- when the HELPER (not the requester) is the one calling cancel.
-- Exposed on the public profile so requesters can make informed choices.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS no_show_count integer NOT NULL DEFAULT 0;
