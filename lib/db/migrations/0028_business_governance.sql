-- no-transaction
-- Migration 0028: business account governance — part 1 of 2
-- Adds per-member spending cap and extends the help_request_status enum.
--
-- MUST be a separate file from the partial index (0028b) because PostgreSQL
-- requires ALTER TYPE ... ADD VALUE to be committed before any subsequent
-- statement (even in the same session) can reference the new value.
-- The migration runner detects the "-- no-transaction" marker and skips
-- BEGIN/COMMIT, letting each statement auto-commit independently.

-- Per-member spending cap in cents. NULL means no cap (default for existing members).
-- updated_at tracks cap changes for audit purposes.
ALTER TABLE business_members
  ADD COLUMN IF NOT EXISTS spending_cap_cents integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now();

-- Add pending_owner_approval so staff-posted business requests can wait in
-- this state before an owner approves them.
ALTER TYPE "public"."help_request_status" ADD VALUE IF NOT EXISTS 'pending_owner_approval';
