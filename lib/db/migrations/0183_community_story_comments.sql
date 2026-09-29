CREATE TABLE IF NOT EXISTS "community_story_comments" (
  "id" serial PRIMARY KEY NOT NULL,
  "story_id" integer NOT NULL REFERENCES "community_stories"("id") ON DELETE CASCADE,
  "author_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "moderation_status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "community_story_comments_story_created_idx"
  ON "community_story_comments" ("story_id", "created_at");
CREATE INDEX IF NOT EXISTS "community_story_comments_moderation_idx"
  ON "community_story_comments" ("moderation_status");