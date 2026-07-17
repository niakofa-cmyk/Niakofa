-- Migration 0022: gratitude_posts moderation columns
--
-- lib/post-moderation.ts (moderatePostText) and CLAUDE.md's "Known design
-- choices" section both describe gratitude_posts.moderation_status as an
-- existing, wired-in gate for the public Community feed — but the column
-- never existed and the function was never called from POST /gratitude.
-- Every post (including spam/link/phone-number matches) was going straight
-- to the public feed unfiltered. This migration adds the missing columns;
-- the route wiring itself is in artifacts/api-server/src/routes/gratitude.ts.
--
-- Idempotent (IF NOT EXISTS) per the established pattern for this repo —
-- see CLAUDE.md Incident #2 on migration ledger desync.

ALTER TABLE "gratitude_posts" ADD COLUMN IF NOT EXISTS "moderation_status" text NOT NULL DEFAULT 'approved';
ALTER TABLE "gratitude_posts" ADD COLUMN IF NOT EXISTS "moderation_reason" text;

CREATE INDEX IF NOT EXISTS "gratitude_posts_moderation_status_idx" ON "gratitude_posts" ("moderation_status");
