import { Router } from "express";
import { db, gratitudePostsTable, gratitudeLikesTable, usersTable, griotStoriesTable, griotTranscriptionJobsTable } from "@workspace/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { communityPostLimiter, communityLikeLimiter, adminLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";

const router = Router();

// ── Validation ────────────────────────────────────────────────────────────────
// NOTE: author_id/author_name/author_avatar are intentionally NOT accepted
// from the client body anymore — see Incident below. They're derived
// server-side from the authenticated user.
const CreateGratitudeBody = z.object({
  request_id: z.number().optional(),
  helper_id: z.number().optional(),
  helper_name: z.string().optional(),
  message: z.string().min(3).max(500),
  request_title: z.string().optional(),
});

// ── GET /gratitude — latest 50 posts for Community feed ───────────────────────
// Only "approved" posts are public. lib/post-moderation.ts's heuristic (run
// at write time in POST /gratitude below) holds spam/link/phone-number/
// all-caps matches as "pending" until an admin reviews them via
// GET/POST /admin/moderation-queue — this filter is what actually makes that
// hold meaningful; without it, pending posts were visible to everyone anyway.
router.get("/gratitude", async (_req, res) => {
  const posts = await db
    .select()
    .from(gratitudePostsTable)
    .where(eq(gratitudePostsTable.moderation_status, "approved"))
    .orderBy(desc(gratitudePostsTable.created_at))
    .limit(50);
  return res.json(posts);
});

// ── GET /admin/moderation-queue — posts held for review ───────────────────────
router.get("/admin/moderation-queue", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const posts = await db
    .select()
    .from(gratitudePostsTable)
    .where(eq(gratitudePostsTable.moderation_status, "pending"))
    .orderBy(desc(gratitudePostsTable.created_at))
    .limit(100);
  return res.json(posts);
});

// ── POST /admin/moderation-queue/:id/decide — approve or reject a held post ──
const ModerationDecisionBody = z.object({ decision: z.enum(["approve", "reject"]) });

router.post("/admin/moderation-queue/:id/decide", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = ModerationDecisionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "decision must be 'approve' or 'reject'" });

  if (parsed.data.decision === "reject") {
    const [deleted] = await db.delete(gratitudePostsTable).where(eq(gratitudePostsTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Post not found" });
    return res.json({ ok: true, id, decision: "reject" });
  }

  const [approved] = await db
    .update(gratitudePostsTable)
    .set({ moderation_status: "approved", moderation_reason: null })
    .where(eq(gratitudePostsTable.id, id))
    .returning();
  if (!approved) return res.status(404).json({ error: "Post not found" });

  // Now that it's approved, surface it to the live Community feed.
  broadcast({ type: "new_gratitude", payload: approved });
  return res.json({ ok: true, id, decision: "approve", post: approved });
});

// ── POST /gratitude — create a new thank-you post ────────────────────────────
// Fixed: previously accepted author_id/author_name/author_avatar straight from
// the request body with NO auth check at all — any anonymous caller could post
// a community message as any other user (impersonation), and the documented
// "communityPostLimiter" rate limit didn't actually exist anywhere in the
// codebase despite the changelog claiming it was added. Both fixed here:
// requireAuth + server-derived identity, and a real per-user limiter.
router.post("/gratitude", requireAuth, communityPostLimiter, async (req, res) => {
  const parsed = CreateGratitudeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const authorId = req.authenticatedUserId!;
  const [author] = await db
    .select({ name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable)
    .where(eq(usersTable.id, authorId))
    .limit(1);
  if (!author) return res.status(401).json({ error: "User not found" });

  // Deterministic write-time moderation screen (lib/post-moderation.ts).
  // Spam/link/phone-number/all-caps matches are held as "pending" instead
  // of going straight to the public feed.
  const moderation = moderatePostText(parsed.data.message);

  const data = {
    ...parsed.data,
    author_id: authorId,
    author_name: author.name,
    author_avatar: author.avatar_url,
    moderation_status: moderation.status,
    moderation_reason: moderation.reason,
  };

  // ── GRATITUDE DUPLICATION PREVENTION ────────────────────────────────────────
  // Check for duplicate gratitude posts within the last 24 hours for the same
  // request_id + author_id + helper_id combination. This prevents users from
  // accidentally posting multiple thank-yous for the same completed request.
  if (data.request_id && data.helper_id) {
    const existing = await db
      .select()
      .from(gratitudePostsTable)
      .where(
        and(
          eq(gratitudePostsTable.request_id, data.request_id),
          eq(gratitudePostsTable.author_id, data.author_id),
          eq(gratitudePostsTable.helper_id, data.helper_id),
          gte(gratitudePostsTable.created_at, sql`NOW() - INTERVAL '24 hours'`)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({
        error: "Duplicate gratitude post",
        message: "You already posted a thank-you for this request within the last 24 hours. Please edit your existing post instead.",
        existing_post_id: existing[0].id,
      });
    }
  }

  const [post] = await db
    .insert(gratitudePostsTable)
    .values(data)
    .returning();

  // Only broadcast to the live Community feed if it cleared moderation —
  // pending posts stay invisible until an admin approves them.
  if (post.moderation_status === "approved") {
    broadcast({ type: "new_gratitude", payload: post });
  }

  return res.status(201).json(post);
});

// ── POST /gratitude/:id/like — like a post (idempotent per user) ─────────────
// Fixed: previously had NO auth and incremented a raw counter with no per-user
// tracking at all — any caller could call this in a loop and inflate the count
// without limit. A gratitude_likes join table with a unique (post_id, user_id)
// index already existed in the schema for exactly this purpose, but no route
// ever used it — the dedup mechanism was built and then never wired in. Now
// actually enforced: requireAuth + insert into gratitude_likes, ON CONFLICT
// DO NOTHING so a repeat call is a harmless no-op instead of a duplicate like.
router.post("/gratitude/:id/like", requireAuth, communityLikeLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  const inserted = await db
    .insert(gratitudeLikesTable)
    .values({ post_id: id, user_id: userId })
    .onConflictDoNothing({ target: [gratitudeLikesTable.post_id, gratitudeLikesTable.user_id] })
    .returning();

  // Already liked by this user — return current count without incrementing again.
  if (inserted.length === 0) {
    const [post] = await db
      .select({ likes: gratitudePostsTable.likes })
      .from(gratitudePostsTable)
      .where(eq(gratitudePostsTable.id, id));
    if (!post) return res.status(404).json({ error: "Post not found" });
    return res.json({ id, likes: post.likes, already_liked: true });
  }

  const [updated] = await db
    .update(gratitudePostsTable)
    .set({ likes: sql`${gratitudePostsTable.likes} + 1` })
    .where(eq(gratitudePostsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Post not found" });

  broadcast({ type: "gratitude_liked", payload: { id, likes: updated.likes } });
  return res.json({ id, likes: updated.likes });
});

// ── POST /gratitude/:id/promote-to-story — turn a thank-you into a Griot story ──
// The main bridge between (B) gratitude and the Griot archive: one click
// takes an existing thank-you message and seeds a griot_stories row the
// author can extend/record over before publishing. request_id and
// community_id (derived from the author's own community) come along for
// free, so the story is already linked back to the real act of help.
router.post("/gratitude/:id/promote-to-story", requireAuth, communityPostLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const postId = Number(req.params.id);
  if (!Number.isFinite(postId)) {
    return res.status(400).json({ error: "Invalid gratitude post id" });
  }

  const [post] = await db
    .select()
    .from(gratitudePostsTable)
    .where(eq(gratitudePostsTable.id, postId))
    .limit(1);
  if (!post) return res.status(404).json({ error: "Gratitude post not found" });
  if (post.author_id !== userId) {
    return res.status(403).json({ error: "Only the author of this thank-you can turn it into a story" });
  }

  const [author] = await db
    .select({ community_id: usersTable.community_id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  try {
    const [story] = await db
      .insert(griotStoriesTable)
      .values({
        author_id:         userId,
        title:             post.request_title ? `Thank you: ${post.request_title}` : "A story of gratitude",
        prompt:            "Tell the fuller story behind this thank-you.",
        text_content:      post.message,
        original_language: "en",
        story_type:        "gratitude",
        request_id:        post.request_id ?? undefined,
        gratitude_post_id: post.id,
        community_id:      author?.community_id ?? undefined,
        visibility:        "public",
        status:            "recorded",
      })
      .returning();

    // Seed text already exists (the original thank-you message) — enqueue
    // straight into the translation-drafting step of the pipeline.
    await db.insert(griotTranscriptionJobsTable).values({ story_id: story.id });

    return res.status(201).json({ story });
  } catch (err: unknown) {
    // UNIQUE(gratitude_post_id) — this post was already promoted (race or
    // repeat click). Look the existing story up instead of erroring blindly.
    if ((err as { code?: string })?.code === "23505") {
      const [existing] = await db
        .select()
        .from(griotStoriesTable)
        .where(eq(griotStoriesTable.gratitude_post_id, postId))
        .limit(1);
      return res.status(409).json({
        error: "This thank-you has already been turned into a story",
        story_id: existing?.id,
      });
    }
    throw err;
  }
});

export default router;
