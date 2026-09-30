import { readFileSync } from "node:fs";

const storyRoutes = readFileSync(new URL("../routes/community-stories.ts", import.meta.url), "utf8");
const interactionRoutes = readFileSync(new URL("../routes/community-story-interactions.ts", import.meta.url), "utf8");
const reportRoutes = readFileSync(new URL("../routes/reports.ts", import.meta.url), "utf8");
const storySchema = readFileSync(new URL("../../../../lib/db/src/schema/community-stories.ts", import.meta.url), "utf8");
const reportSchema = readFileSync(new URL("../../../../lib/db/src/schema/reports.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../../../lib/db/migrations/0184_community_story_moderation.sql", import.meta.url), "utf8");

describe("Community Moment moderation contracts", () => {
  it("filters blocked and muted authors in both the feed and story read policy", () => {
    expect(storyRoutes).toContain('router.get("/community/stories", requireAuth, requireApproved');
    expect(storyRoutes).toContain("FROM direct_message_blocks story_block");
    expect(storyRoutes).toContain("FROM community_story_author_mutes story_mute");
    expect(storyRoutes).toContain("if (blocks.length) return false;");
    expect(storyRoutes).toContain("if (mute) return false;");
  });

  it("applies the shared visibility policy to story interactions and comments", () => {
    expect(interactionRoutes).toContain('import { viewerCanReadStory } from "./community-stories"');
    expect(interactionRoutes).toContain("!(await viewerCanReadStory(userId, story))");
    expect(interactionRoutes).toContain("const story = await readableStory(id, req.authenticatedUserId!)");
  });

  it("keeps mute preferences private and reversible", () => {
    expect(storyRoutes).toContain('router.get("/community/stories/muted-authors", requireAuth, requireApproved');
    expect(storyRoutes).toContain('router.put("/community/stories/authors/:id/mute", requireAuth, requireApproved');
    expect(storyRoutes).toContain('router.delete("/community/stories/authors/:id/mute", requireAuth, requireApproved');
    expect(storySchema).toContain('pgTable("community_story_author_mutes"');
    expect(storySchema).toContain('check("community_story_author_mutes_distinct_users"');
    expect(migration).toContain("community_story_author_mutes_distinct_users CHECK (viewer_user_id <> muted_user_id)");
  });

  it("accepts reports only for visible, active Moments and prevents self/duplicate reports", () => {
    expect(reportSchema).toContain('integer("reported_community_story_id")');
    expect(reportRoutes).toContain("reported_community_story_id: z.number().int().positive().nullable().optional()");
    expect(reportRoutes).toContain("Specify exactly one report target");
    expect(reportRoutes).toContain("Cannot report your own Moment.");
    expect(reportRoutes).toContain("viewerCanReadStory(reporter_id, story)");
    expect(reportRoutes).toContain("You have already reported this Moment.");
    expect(migration).toContain("reports_community_story_reporter_unique_idx");
  });

  it("exposes Moment context to admins and removes a Moment only after an upheld moderator decision", () => {
    expect(reportRoutes).toContain("reported_community_story_caption");
    expect(reportRoutes).toContain("reported_community_story_author_name");
    expect(reportRoutes).toContain('if (updated.reported_community_story_id && status === "resolved_banned")');
    expect(reportRoutes).toContain('.set({ status: "removed" })');
    expect(reportRoutes).toContain("Auto-dismissed: Moment already removed via report");
  });
});