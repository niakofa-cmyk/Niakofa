-- Migration 0027: business accounts
-- Adds businesses table, business_members table, and business_id FK on help_requests.
-- account_type already exists on users (default 'individual') but nothing branched on it.
-- This migration gives it real infrastructure to branch on.

CREATE TABLE IF NOT EXISTS businesses (
  id                  serial PRIMARY KEY,
  legal_name          text NOT NULL,
  display_name        text NOT NULL,
  address             text,
  phone               text,
  stripe_customer_id  text,
  approval_status     text NOT NULL DEFAULT 'pending',
  created_by_user_id  integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS businesses_approval_status_idx
  ON businesses (approval_status);

CREATE INDEX IF NOT EXISTS businesses_created_by_user_id_idx
  ON businesses (created_by_user_id);

CREATE TABLE IF NOT EXISTS business_members (
  id          serial PRIMARY KEY,
  business_id integer NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'staff',
  status      text NOT NULL DEFAULT 'active',
  invited_at  timestamp NOT NULL DEFAULT now(),
  accepted_at timestamp,
  CONSTRAINT business_members_unique UNIQUE (business_id, user_id)
);

CREATE INDEX IF NOT EXISTS business_members_business_id_idx
  ON business_members (business_id);

CREATE INDEX IF NOT EXISTS business_members_user_id_idx
  ON business_members (user_id);

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS business_id integer REFERENCES businesses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS help_requests_business_id_idx
  ON help_requests (business_id)
  WHERE business_id IS NOT NULL;
