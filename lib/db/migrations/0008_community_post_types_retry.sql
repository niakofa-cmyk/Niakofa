-- 0007_community_post_types claimed success in drizzle's migration ledger on
-- production but the columns never actually landed on gratitude_posts
-- (confirmed via a live 42703 "column does not exist" error). Rather than
-- rely on understanding exactly why the ledger and the real schema
-- diverged, this migration re-issues the identical idempotent statements
-- under a new tag so drizzle-kit is guaranteed to execute them again.
DO $$ BEGIN
 CREATE TYPE "community_post_type" AS ENUM('thanks', 'offer', 'resource', 'update');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "post_moderation_status" AS ENUM('approved', 'pending', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "gratitude_posts" ADD COLUMN IF NOT EXISTS "post_type" "community_post_type" DEFAULT 'thanks' NOT NULL;
--> statement-breakpoint
ALTER TABLE "gratitude_posts" ADD COLUMN IF NOT EXISTS "photo_url" text;
--> statement-breakpoint
ALTER TABLE "gratitude_posts" ADD COLUMN IF NOT EXISTS "moderation_status" "post_moderation_status" DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
ALTER TABLE "gratitude_posts" ADD COLUMN IF NOT EXISTS "flagged_reason" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gratitude_posts_moderation_status_idx" ON "gratitude_posts" USING btree ("moderation_status");
