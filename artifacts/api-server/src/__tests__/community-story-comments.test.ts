import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const routePath = new URL("../routes/community-story-interactions.ts", import.meta.url);
const schemaPath = new URL("../../../../lib/db/src/schema/community-stories.ts", import.meta.url);
const migrationPath = new URL("../../../../lib/db/migrations/0183_community_story_comments.sql", import.meta.url);

describe("Community Spark public comments contract", () => {
  it("protects every comment operation with readableStory and approved authentication", async () => {
    const route = await fs.readFile(routePath, "utf8");
    for (const declaration of [
      'router.get("/community/stories/:id/comments"',
      'router.post("/community/stories/:id/comments"',
      'router.delete("/community/stories/:id/comments/:commentId"',
    ]) {
      const start = route.indexOf(declaration);
      expect(start).toBeGreaterThanOrEqual(0);
      const endpoint = route.slice(start, route.indexOf("\n", start));
      expect(endpoint).toMatch(/requireAuth, requireApproved/);
      const body = route.slice(start, route.indexOf("\nrouter.", start + 1));
      expect(body).toMatch(/readableStory\(id, req\.authenticatedUserId!\)/);
      expect(body).toMatch(/if \(!story\) return res\.status\(404\)/);
    }
    expect(route).toMatch(/story\.expires_at <= new Date\(\)/);
    expect(route).toMatch(/viewerCanReadStory\(userId, story\)/);
  });

  it("validates public comment bodies and derives the author from auth", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const post = route.slice(route.indexOf('router.post("/community/stories/:id/comments"'));
    expect(post).toMatch(/body\.length > 500/);
    expect(post).toMatch(/req\.body\?\.body/);
    expect(post).toMatch(/author_user_id: req\.authenticatedUserId!/);
    expect(post).toMatch(/moderatePostText\(body\)/);
    expect(post).toMatch(/communityPostLimiter/);
    expect(post).toMatch(/res\.status\(202\)\.json\(\{ ok: true, moderation_pending: true/);
    expect(post).not.toMatch(/author_user_id: req\.body/);
  });

  it("hides pending comments, caps and counts approved comments, and scopes deletion", async () => {
    const route = await fs.readFile(routePath, "utf8");
    const get = route.slice(route.indexOf('router.get("/community/stories/:id/comments"'));
    expect(get).toMatch(/eq\(communityStoryCommentsTable\.moderation_status, "approved"\)/);
    expect(get).toMatch(/\.orderBy\(communityStoryCommentsTable\.created_at\)/);
    expect(get).toMatch(/\.limit\(50\)/);
    expect(get).toMatch(/total: Number\(total\?\.count/);
    const deletion = route.slice(route.indexOf('router.delete("/community/stories/:id/comments/:commentId"'));
    expect(deletion).toMatch(/comment\.author_user_id !== req\.authenticatedUserId! && story\.author_user_id !== req\.authenticatedUserId!/);
    expect(deletion).toMatch(/res\.status\(403\)/);
    expect(deletion).toMatch(/eq\(communityStoryCommentsTable\.story_id, id\)/);
    expect(route).toMatch(/comment_count: Number\(commentCount\?\.count/);
  });

  it("keeps Drizzle and SQL deletion semantics aligned", async () => {
    const schema = await fs.readFile(schemaPath, "utf8");
    const migration = await fs.readFile(migrationPath, "utf8");
    expect(schema).toMatch(/communityStoryCommentsTable/);
    expect(schema).toMatch(/author_user_id: integer\("author_user_id"\)\.references\(\(\) => usersTable\.id, \{ onDelete: "set null" \}\)/);
    expect(schema).toMatch(/story_id: integer\("story_id"\)\.notNull\(\)\.references\(\(\) => communityStoriesTable\.id, \{ onDelete: "cascade" \}\)/);
    expect(migration).toMatch(/"story_id" integer NOT NULL REFERENCES "community_stories"\("id"\) ON DELETE CASCADE/);
    expect(migration).toMatch(/"author_user_id" integer REFERENCES "users"\("id"\) ON DELETE SET NULL/);
    expect(migration).toMatch(/community_story_comments_story_created_idx/);
    expect(migration).toMatch(/community_story_comments_moderation_idx/);
  });
});