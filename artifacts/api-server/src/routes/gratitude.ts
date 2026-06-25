import { Router } from "express";
import { db, gratitudePostsTable, gratitudeLikesTable, usersTable, requestsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { moderatePostText } from "../lib/post-moderation";
import { communityPostLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { z } from "zod";

const router = Router();

const ALLOWED_PHOTO_PREFIXES = ["data:image/jpeg;", "data:image/jpg;", "data:image/png;", "data:image/webp;", "data:image/gif;"];
const MAX_PHOTO_DATA_URL_LENGTH = 5 * 1024 * 1024; // same convention/cap as users.avatar_url — see that route's comment

function validatePhotoUrl(photoUrl: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (photoUrl === undefined || photoUrl === null) return { ok: true, value: null };
  if (typeof photoUrl !== "string" || !ALLOWED_PHOTO_PREFIXES.some(p => photoUrl.startsWith(p))) {
    return { ok: false, error: "Invalid image — must be jpeg, png, webp, or gif" };
  }
  if (photoUrl.length > MAX_PHOTO_DATA_URL_LENGTH) {
    return { ok: false, error: "Image too large — max 5 MB" };
  }
  return { ok: true, value: photoUrl };
}

// ── Validation ────────────────────────────────────────────────────────────────
// author_id/author_name/author_avatar and helper_id/helper_name/request_title
// are intentionally NOT accepted from the client body anymore — they're
// derived server-side below from the authenticated caller and the actual
// request row, so nobody can post as or attribute gratitude to an arbitrary
// user.
const CreateGratitudeBody = z.object({
  request_id: z.number().optional(),
  message: z.string().min(3).max(500),
});

// ── GET /gratitude — paginated approved posts for Community feed ──────────────
// Pending/rejected posts are withheld from the public feed until an admin
// reviews them via the moderation queue below.
// Pagination: ?limit=20&offset=0 (max limit 100)
router.get("/gratitude", async (req, res) => {
  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10);
  const rawOffset = parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 20 : rawLimit), 100);
  const offset = Math.max(0, isNaN(rawOffset) ? 0 : rawOffset);

  const posts = await db
    .select()
    .from(gratitudePostsTable)
    .where(eq(gratitudePostsTable.moderation_status, "approved"))
    .orderBy(desc(gratitudePostsTable.created_at))
    .limit(limit)
    .offset(offset);
  return res.json({ posts, limit, offset, hasMore: posts.length === limit });
});

// ── POST /gratitude — create a new thank-you post ────────────────────────────
router.post("/gratitude", requireAuth, async (req, res) => {
  const parsed = CreateGratitudeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }
  const authorId = req.authenticatedUserId!;

  const [author] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable).where(eq(usersTable.id, authorId)).limit(1);
  if (!author) return res.status(404).json({ error: "Author not found" });

  let helper_id: number | null = null;
  let helper_name: string | null = null;
  let request_title: string | null = null;

  if (parsed.data.request_id) {
    const [request] = await db.select({
      helper_id: requestsTable.helper_id,
      title: requestsTable.title,
      requester_id: requestsTable.requester_id,
    }).from(requestsTable).where(eq(requestsTable.id, parsed.data.request_id)).limit(1);

    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.requester_id !== authorId) {
      return res.status(403).json({ error: "You can only post gratitude for your own requests" });
    }

    request_title = request.title;
    if (request.helper_id) {
      helper_id = request.helper_id;
      const [helper] = await db.select({ name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, request.helper_id)).limit(1);
      helper_name = helper?.name ?? null;
    }
  }

  const moderation = moderatePostText(parsed.data.message);

  const [post] = await db
    .insert(gratitudePostsTable)
    .values({
      request_id: parsed.data.request_id ?? null,
      author_id: authorId,
      author_name: author.name,
      author_avatar: author.avatar_url,
      helper_id,
      helper_name,
      message: parsed.data.message,
      request_title,
      post_type: "thanks",
      moderation_status: moderation.status,
      flagged_reason: moderation.reason,
    })
    .returning();

  // Only broadcast to the live feed if it actually cleared moderation —
  // pending posts stay invisible until an admin approves them.
  if (moderation.status === "approved") {
    broadcast({ type: "new_gratitude", payload: post });
  }

  return res.status(201).json(post);
});

// ── Community post types (offer / resource / update) ─────────────────────────
const CreateCommunityPostBody = z.object({
  post_type: z.enum(["offer", "resource", "update"]),
  message: z.string().min(3).max(500),
  photo_url: z.string().optional().nullable(),
});

// ── POST /community-posts — general feed posts beyond gratitude ──────────────
router.post("/community-posts", requireAuth, communityPostLimiter, async (req, res) => {
  const parsed = CreateCommunityPostBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }
  const authorId = req.authenticatedUserId!;

  const photoCheck = validatePhotoUrl(parsed.data.photo_url);
  if (!photoCheck.ok) {
    return res.status(413).json({ error: photoCheck.error });
  }

  const [author] = await db.select({ name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable).where(eq(usersTable.id, authorId)).limit(1);
  if (!author) return res.status(404).json({ error: "Author not found" });

  const moderation = moderatePostText(parsed.data.message);
  // Any post carrying a photo gets held for review on this first pass —
  // the text heuristic has nothing to say about image content, and we'd
  // rather a human looks at every photo once than auto-approve blind.
  const finalStatus: "approved" | "pending" = photoCheck.value ? "pending" : moderation.status;
  const finalReason = photoCheck.value && moderation.status === "approved" ? "contains photo — awaiting review" : moderation.reason;

  let post;
  try {
    [post] = await db
      .insert(gratitudePostsTable)
      .values({
        request_id: null,
        author_id: authorId,
        author_name: author.name,
        author_avatar: author.avatar_url,
        helper_id: null,
        helper_name: null,
        message: parsed.data.message,
        request_title: null,
        post_type: parsed.data.post_type,
        photo_url: photoCheck.value,
        moderation_status: finalStatus,
        flagged_reason: finalReason,
      })
      .returning();
  } catch (err) {
    logger.error({ err, cause: err instanceof Error ? err.cause : undefined }, "community-posts: insert failed");
    return res.status(500).json({ error: "Failed to create post" });
  }

  if (finalStatus === "approved") {
    broadcast({ type: "new_gratitude", payload: post });
  }

  return res.status(201).json(post);
});

// ── POST /gratitude/:id/like — increment likes (once per user per post) ──────
router.post("/gratitude/:id/like", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const userId = req.authenticatedUserId!;

  try {
    await db.insert(gratitudeLikesTable).values({ post_id: id, user_id: userId });
  } catch (err) {
    // Unique constraint violation = already liked this post — treat as a
    // no-op rather than an error, so a double-tap doesn't surface a 500.
    const [existing] = await db.select({ likes: gratitudePostsTable.likes })
      .from(gratitudePostsTable).where(eq(gratitudePostsTable.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Post not found" });
    return res.json({ id, likes: existing.likes, alreadyLiked: true });
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

// ── Admin moderation queue ─────────────────────────────────────────────────────
// GET /admin/moderation-queue — pending posts awaiting human review
router.get("/admin/moderation-queue", requireAuth, requireAdmin(), async (_req, res) => {
  const pending = await db
    .select()
    .from(gratitudePostsTable)
    .where(eq(gratitudePostsTable.moderation_status, "pending"))
    .orderBy(desc(gratitudePostsTable.created_at))
    .limit(100);
  return res.json(pending);
});

const ReviewBody = z.object({
  decision: z.enum(["approve", "reject"]),
});

// POST /admin/moderation-queue/:id/review — approve or reject a pending post
router.post("/admin/moderation-queue/:id/review", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const newStatus = parsed.data.decision === "approve" ? "approved" : "rejected";

  const [updated] = await db
    .update(gratitudePostsTable)
    .set({ moderation_status: newStatus })
    .where(eq(gratitudePostsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Post not found" });

  if (newStatus === "approved") {
    // Wasn't visible on the live feed until now — broadcast it the moment
    // an admin clears it, same as a normal new post.
    broadcast({ type: "new_gratitude", payload: updated });
  }

  return res.json(updated);
});

export default router;
