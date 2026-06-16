import { Router } from "express";
import { db, chatMessagesTable, requestsTable } from "@workspace/db";
import { eq, and, lt, desc } from "drizzle-orm";
import { broadcast } from "../lib/ws-hub";
import { chatLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// GET /requests/:id/chat?before=<sent_at ISO>&limit=50
// Cursor pagination on sent_at (stable with timestamps)
router.get("/requests/:id/chat", async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const limit = Math.min(parseInt(req.query.limit as string || "50"), 100);
  const before = req.query.before ? new Date(req.query.before as string) : null;

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      before
        ? and(eq(chatMessagesTable.request_id, requestId), lt(chatMessagesTable.sent_at, before))
        : eq(chatMessagesTable.request_id, requestId)
    )
    .orderBy(desc(chatMessagesTable.sent_at))
    .limit(limit);

  return res.json(messages.reverse());
});

// POST /requests/:id/chat
router.post("/requests/:id/chat", chatLimiter, async (req, res) => {
  const requestId = parseInt(req.params.id);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const { sender_id, content } = req.body as { sender_id: number; content: string };
  if (!sender_id || !content?.trim()) return res.status(400).json({ error: "sender_id and content required" });
  if (content.length > 1000) return res.status(400).json({ error: "Message too long (max 1000 chars)" });

  // Verify request exists
  const [request] = await db.select({ id: requestsTable.id }).from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });

  const [msg] = await db.insert(chatMessagesTable).values({
    request_id: requestId,
    sender_id,
    content: content.trim(),
  }).returning();

  // Real-time broadcast to both parties
  broadcast({ type: "chat_message" as any, payload: msg });
  logger.info({ request_id: requestId, sender_id }, "chat: message sent");

  return res.status(201).json(msg);
});

// PATCH /requests/:id/chat/read — mark messages read
router.patch("/requests/:id/chat/read", async (req, res) => {
  const requestId = parseInt(req.params.id);
  const { reader_id } = req.body as { reader_id: number };
  if (isNaN(requestId) || !reader_id) return res.status(400).json({ error: "Invalid" });

  await db
    .update(chatMessagesTable)
    .set({ read_at: new Date() })
    .where(
      and(
        eq(chatMessagesTable.request_id, requestId),
        eq(chatMessagesTable.read_at, null as any)
      )
    );

  return res.json({ ok: true });
});

export default router;
