import { Router } from "express";
import { db, gratitudePostsTable, gratitudeLikesTable, usersTable } from "@workspace/db";
import { desc, eq, sql, and, gte } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { communityPostLimiter, communityLikeLimiter } from "../middlewares/rate-limit";

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
router.get("/gratitude", async (_req, res) => {
  const posts = await db
    .select()
    .from(gratitudePostsTable)
    .orderBy(desc(gratitudePostsTable.created_at))
    .limit(50);
  return res.json(posts);
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

  const data = {
    ...parsed.data,
    author_id: authorId,
    author_name: author.name,
    author_avatar: author.avatar_url,
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

  // Push to all connected clients — Community feed updates live
  broadcast({ type: "new_gratitude", payload: post });

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

export default router;
