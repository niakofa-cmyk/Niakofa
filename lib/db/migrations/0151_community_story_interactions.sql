CREATE TABLE IF NOT EXISTS "community_story_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "story_id" integer NOT NULL REFERENCES "community_stories"("id") ON DELETE CASCADE,
  "viewer_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "viewed_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_story_views_story_viewer_uidx" ON "community_story_views" ("story_id", "viewer_user_id");
CREATE INDEX IF NOT EXISTS "community_story_views_story_idx" ON "community_story_views" ("story_id", "viewed_at");

CREATE TABLE IF NOT EXISTS "community_story_reactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "story_id" integer NOT NULL REFERENCES "community_stories"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reaction" text NOT NULL DEFAULT '💙',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "community_story_reactions_story_user_uidx" ON "community_story_reactions" ("story_id", "user_id");
CREATE INDEX IF NOT EXISTS "community_story_reactions_story_idx" ON "community_story_reactions" ("story_id");

CREATE TABLE IF NOT EXISTS "community_story_shares" (
  "id" serial PRIMARY KEY NOT NULL,
  "story_id" integer NOT NULL REFERENCES "community_stories"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "community_story_shares_story_idx" ON "community_story_shares" ("story_id", "created_at");