-- Migration 0021: Password reset code columns
-- Supports the "returning user" flow for legacy accounts created before
-- password auth existed (no password_hash) and standard forgot-password
-- resets: a 6-digit emailed code with a short expiry, verified by
-- POST /users/set-initial-password before a password_hash is written.
-- Idempotent (IF NOT EXISTS) per the established pattern for this repo —
-- see CLAUDE.md Incident #2 on migration ledger desync.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_code" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_expires_at" timestamp with time zone;

-- One-time backfill: every existing "individual" account is currently stuck
-- at approval_status='pending' (the DB default), since nothing in the
-- application code ever advanced it and no admin endpoint to do so existed
-- until this same change set. This was blocking every real user from using
-- the app at all (see CLAUDE.md Incident #19). Organization accounts are
-- deliberately left untouched — they still require real admin review.
-- Safe to re-run: only touches rows still sitting at the default state.
UPDATE "users"
SET "approval_status" = 'approved'
WHERE "account_type" = 'individual' AND "approval_status" = 'pending';
