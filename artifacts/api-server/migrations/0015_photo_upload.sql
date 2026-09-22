-- Migration 0015: Add photo_url to help_requests
-- Adds optional photo upload support for help requests
-- Photos stored as base64 data URLs (compressed to ~800px on client side)

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

COMMENT ON COLUMN help_requests.photo_url IS 'Optional base64 data URL photo (JPEG ~800px)';
