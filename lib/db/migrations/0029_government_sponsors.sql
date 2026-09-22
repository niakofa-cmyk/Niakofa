-- Migration 0029: Government / County Sponsor Applications
-- Adds a government_sponsors table for county and government entities to apply
-- as named community pool sponsors, following the same approval-queue pattern
-- as the businesses table (migration 0027).

CREATE TABLE IF NOT EXISTS "government_sponsors" (
  "id" serial PRIMARY KEY,
  "entity_name" text NOT NULL,
  "county" text NOT NULL,
  "state" text NOT NULL,
  "city" text,
  "contact_name" text NOT NULL,
  "contact_email" text NOT NULL,
  "contact_phone" text,
  "description" text,
  "website_url" text,
  "approval_status" text NOT NULL DEFAULT 'pending',
  "admin_notes" text,
  "submitted_by_user_id" integer NOT NULL,
  "reviewed_at" timestamp,
  "reviewed_by_user_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "gov_sponsors_approval_status_idx"
  ON "government_sponsors" ("approval_status");

CREATE INDEX IF NOT EXISTS "gov_sponsors_submitted_by_idx"
  ON "government_sponsors" ("submitted_by_user_id");

CREATE INDEX IF NOT EXISTS "gov_sponsors_county_state_idx"
  ON "government_sponsors" ("county", "state");
