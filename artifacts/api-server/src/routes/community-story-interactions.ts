import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryReactionsTable,
  communityStorySharesTable,
  communityStoryViewsTable,
  db,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { createMessageNotification } from "../lib/message-notifications";
import { sendToUser } from "../lib/ws-hub";
import { viewerCanReadStory } from "./community-stories";

const router = Router();

function storyId(value: unknown): number | null {
  const id = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function readableStory(id: number, userId: number) {
  const [story] = await db.select({
    id: communityStoriesTable.id,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    audience: communityStoriesTable.audience,
    status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
  }).from(communityStoriesTable).where(eq(communityStoriesTable.id, id)).limit(1);
  if (!story || story.status !== "published" || story.expires_at <= new Date() || !(await viewerCanReadStory(userId, story))) return null;
  return story;
}

router.get("/community/stories/:id/interactions", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  const [views, reactions, shares, mine] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(communityStoryViewsTable).where(eq(communityStoryViewsTable.story_id, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(communityStoryReactionsTable).where(eq(communityStoryReactionsTable.story_id, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(communityStorySharesTable).where(eq(communityStorySharesTable.story_id, id)),
    db.select({ reaction: communityStoryReactionsTable.reaction }).from(communityStoryReactionsTable).where(and(eq(communityStoryReactionsTable.story_id, id), eq(communityStoryReactionsTable.user_id, req.authenticatedUserId!))).limit(1),
  ]);
  return res.json({
    story_id: id,
    views: Number(views[0]?.count ?? 0),
    reactions: Number(reactions[0]?.count ?? 0),
    shares: Number(shares[0]?.count ?? 0),
    viewer_reaction: mine[0]?.reaction ?? null,
  });
});

router.post("/community/stories/:id/view", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  await db.insert(communityStoryViewsTable).values({ story_id: id, viewer_user_id: req.authenticatedUserId! }).onConflictDoNothing();
  sendToUser(story.author_user_id, { type: "community_story_viewed", payload: { story_id: id, viewer_user_id: req.authenticatedUserId! } });
  return res.status(201).json({ ok: true });
});

router.post("/community/stories/:id/reaction", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  const reaction = typeof req.body?.reaction === "string" && req.body.reaction.trim() ? req.body.reaction.trim().slice(0, 16) : "💙";
  await db.insert(communityStoryReactionsTable).values({ story_id: id, user_id: req.authenticatedUserId!, reaction }).onConflictDoUpdate({
    target: [communityStoryReactionsTable.story_id, communityStoryReactionsTable.user_id],
    set: { reaction, created_at: new Date() },
  });
  sendToUser(story.author_user_id, { type: "community_story_reaction", payload: { story_id: id, user_id: req.authenticatedUserId!, reaction } });
  await createMessageNotification({
    userId: story.author_user_id,
    actorUserId: req.authenticatedUserId!,
    type: "story_reaction",
    title: "Someone reacted to your Story",
    body: reaction,
    actionUrl: `/community?storyId=${id}`,
    metadata: { story_id: id, reaction },
  });
  return res.status(201).json({ ok: true, reaction });
});

router.delete("/community/stories/:id/reaction", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  await db.delete(communityStoryReactionsTable).where(and(eq(communityStoryReactionsTable.story_id, id), eq(communityStoryReactionsTable.user_id, req.authenticatedUserId!)));
  return res.json({ ok: true });
});

router.post("/community/stories/:id/share", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  await db.insert(communityStorySharesTable).values({ story_id: id, user_id: req.authenticatedUserId! });
  sendToUser(story.author_user_id, { type: "community_story_shared", payload: { story_id: id, user_id: req.authenticatedUserId! } });
  await createMessageNotification({
    userId: story.author_user_id,
    actorUserId: req.authenticatedUserId!,
    type: "story_share",
    title: "Someone shared your Story",
    body: "Your Community Story was shared.",
    actionUrl: `/community?storyId=${id}`,
    metadata: { story_id: id },
  });
  return res.status(201).json({ ok: true });
});

router.get("/community/stories/mention-candidates", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const query = typeof req.query.q === "string" ? req.query.q.trim().replace(/[%_]/g, "\\$&") : "";
  const rows = await db.select({ id: usersTable.id, name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable)
    .where(and(eq(usersTable.approval_status, "approved"), eq(usersTable.is_suspended, false), sql`${usersTable.id} <> ${userId}`, query ? sql`${usersTable.name} ILIKE ${`%${query}%`}` : sql`true`))
    .orderBy(usersTable.name)
    .limit(20);
  return res.json({ users: rows });
});

export default router;