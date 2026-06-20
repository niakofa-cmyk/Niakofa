import { Router } from "express";
import { db, gratitudePostsTable, gratitudeLikesTable, usersTable, requestsTable } from "@workspace/db";
import { desc, eq, sql, and } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router = Router();

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
    })
    .returning();

  // Push to all connected clients — Community feed updates live
  broadcast({ type: "new_gratitude", payload: post });

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

export default router;
