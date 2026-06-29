import { Router } from "express";
import { db, gratitudePostsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { z } from "zod";

const router = Router();

// ── Validation ────────────────────────────────────────────────────────────────

const CreateGratitudeBody = z.object({
  request_id: z.number().optional(),
  author_id: z.number(),
  author_name: z.string().min(1).max(80),
  author_avatar: z.string().optional(),
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
router.post("/gratitude", async (req, res) => {
  const parsed = CreateGratitudeBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const data = parsed.data;

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

// ── POST /gratitude/:id/like — increment likes ───────────────────────────────
router.post("/gratitude/:id/like", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

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
