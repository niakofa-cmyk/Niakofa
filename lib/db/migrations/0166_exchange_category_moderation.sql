-- Granular Exchange discovery controls and moderator-confirmed safety lifecycle.
-- All statements are idempotent because Railway and fresh databases may apply
-- migrations through different bootstrap paths.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notif_exchange_needs boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_exchange_offers boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_exchange_goods boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_exchange_services boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_exchange_urgent_aid boolean NOT NULL DEFAULT true;

ALTER TABLE exchange_listings
  ADD COLUMN IF NOT EXISTS moderation_hold_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderation_hold_reason text,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_by integer,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_at timestamptz;

ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'commercial_pricing';
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'spam_or_solicitation';
ALTER TYPE report_type ADD VALUE IF NOT EXISTS 'unsafe_or_harmful';

CREATE TABLE IF NOT EXISTS exchange_moderation_review_history (
  id serial PRIMARY KEY,
  report_id integer NOT NULL,
  listing_id integer NOT NULL REFERENCES exchange_listings(id) ON DELETE RESTRICT,
  moderator_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  previous_moderation_status text,
  next_moderation_status text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_moderation_review_history_listing_idx
  ON exchange_moderation_review_history(listing_id, created_at);
CREATE INDEX IF NOT EXISTS exchange_moderation_review_history_report_idx
  ON exchange_moderation_review_history(report_id, created_at);