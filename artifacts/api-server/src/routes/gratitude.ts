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

  const [post] = await db
    .insert(gratitudePostsTable)
    .values(parsed.data)
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
