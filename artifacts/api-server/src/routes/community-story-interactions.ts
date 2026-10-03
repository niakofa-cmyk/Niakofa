import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryReactionsTable,
  communityStorySharesTable,
  communityStoryCommentsTable,
  communityStoryViewsTable,
  db,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { communityPostLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { normalizeCommunityStoryMentionQuery } from "../lib/community-story-policy";
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
  const [commentCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(communityStoryCommentsTable)
    .where(and(eq(communityStoryCommentsTable.story_id, id), eq(communityStoryCommentsTable.moderation_status, "approved")));
  return res.json({
    story_id: id,
    views: Number(views[0]?.count ?? 0),
    reactions: Number(reactions[0]?.count ?? 0),
    shares: Number(shares[0]?.count ?? 0),
    viewer_reaction: mine[0]?.reaction ?? null,
    comment_count: Number(commentCount?.count ?? 0),
  });
});

router.get("/community/stories/:id/comments", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  const rows = await db.select({
    id: communityStoryCommentsTable.id,
    body: communityStoryCommentsTable.body,
    author_user_id: communityStoryCommentsTable.author_user_id,
    created_at: communityStoryCommentsTable.created_at,
    author_name: usersTable.name,
    avatar_url: usersTable.avatar_url,
  }).from(communityStoryCommentsTable)
    .leftJoin(usersTable, eq(usersTable.id, communityStoryCommentsTable.author_user_id))
    .where(and(eq(communityStoryCommentsTable.story_id, id), eq(communityStoryCommentsTable.moderation_status, "approved")))
    .orderBy(communityStoryCommentsTable.created_at)
    .limit(50);
  const [total] = await db.select({ count: sql<number>`count(*)::int` })
    .from(communityStoryCommentsTable)
    .where(and(eq(communityStoryCommentsTable.story_id, id), eq(communityStoryCommentsTable.moderation_status, "approved")));
  const viewerId = req.authenticatedUserId!;
  return res.json({
    story_id: id,
    total: Number(total?.count ?? 0),
    comments: rows.map((row) => ({
      id: row.id, body: row.body, created_at: row.created_at.toISOString(),
      author: { id: row.author_user_id, name: row.author_name ?? "Former member", avatar_url: row.avatar_url },
      viewer_can_delete: row.author_user_id === viewerId || story.author_user_id === viewerId,
    })),
  });
});

router.post("/community/stories/:id/comments", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid Story id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > 500) return res.status(400).json({ error: "Comment must be between 1 and 500 characters." });
  const [author] = await db.select({ approval_status: usersTable.approval_status, is_suspended: usersTable.is_suspended })
    .from(usersTable).where(eq(usersTable.id, req.authenticatedUserId!)).limit(1);
  if (!author || author.approval_status !== "approved" || author.is_suspended) {
    return res.status(403).json({ error: "An approved, active account is required to comment." });
  }
  const moderation = moderatePostText(body);
  try {
    const [comment] = await db.insert(communityStoryCommentsTable).values({
      story_id: id, author_user_id: req.authenticatedUserId!, body, moderation_status: moderation.status,
    }).returning({ id: communityStoryCommentsTable.id, created_at: communityStoryCommentsTable.created_at });
    if (moderation.status !== "approved") {
      return res.status(202).json({ ok: true, moderation_pending: true, comment_id: comment?.id });
    }
    return res.status(201).json({ ok: true, comment: { id: comment?.id, body, created_at: comment?.created_at?.toISOString(), viewer_can_delete: true } });
  } catch {
    return res.status(500).json({ error: "Comment could not be saved." });
  }
});

router.delete("/community/stories/:id/comments/:commentId", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = storyId(req.params.id);
  const commentId = storyId(req.params.commentId);
  if (!id || !commentId) return res.status(400).json({ error: "Invalid Story or comment id." });
  const story = await readableStory(id, req.authenticatedUserId!);
  if (!story) return res.status(404).json({ error: "Story not found." });
  const [comment] = await db.select({ author_user_id: communityStoryCommentsTable.author_user_id })
    .from(communityStoryCommentsTable)
    .where(and(eq(communityStoryCommentsTable.id, commentId), eq(communityStoryCommentsTable.story_id, id))).limit(1);
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  if (comment.author_user_id !== req.authenticatedUserId! && story.author_user_id !== req.authenticatedUserId!) {
    return res.status(403).json({ error: "You cannot remove this comment." });
  }
  try {
    await db.delete(communityStoryCommentsTable).where(eq(communityStoryCommentsTable.id, commentId));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Comment could not be removed." });
  }
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
  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const usernameOnly = rawQuery.startsWith("@");
  const query = normalizeCommunityStoryMentionQuery(rawQuery);
  const pattern = query ? `%${query}%` : "";
  const rows = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    username: usersTable.username,
    avatar_url: usersTable.avatar_url,
  })
    .from(usersTable)
    .where(and(
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      eq(usersTable.deletion_status, "active"),
      sql`${usersTable.id} <> ${userId}`,
      query
        ? usernameOnly
          ? sql`${usersTable.username} ILIKE ${pattern}`
          : sql`(${usersTable.username} ILIKE ${pattern} OR ${usersTable.name} ILIKE ${pattern})`
        : sql`true`,
    ))
    .orderBy(sql`lower(coalesce(${usersTable.username}, ${usersTable.name}))`)
    .limit(20);
  return res.json({ users: rows });
});

export default router;