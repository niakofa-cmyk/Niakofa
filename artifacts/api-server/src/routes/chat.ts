import { Router } from "express";
import { db, chatMessagesTable, requestsTable, requestHelpersTable } from "@workspace/db";
import { eq, and, lt, desc, isNull, ne } from "drizzle-orm";
import { sendToUser } from "../lib/ws-hub";
import { chatLimiter } from "../middlewares/rate-limit";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// GET /requests/:id/chat?before=<sent_at ISO>&limit=50
// Requires a valid Bearer token — only authenticated users can read messages.
router.get("/requests/:id/chat", requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const limit = Math.min(parseInt((req.query.limit as string) || "50"), 100);
  const before = req.query.before ? new Date(req.query.before as string) : null;

  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(
      before
        ? and(
            eq(chatMessagesTable.request_id, requestId),
            lt(chatMessagesTable.sent_at, before),
          )
        : eq(chatMessagesTable.request_id, requestId),
    )
    .orderBy(desc(chatMessagesTable.sent_at))
    .limit(limit);

  return res.json(messages.reverse());
});

// POST /requests/:id/chat
// requireAuth verifies the Bearer token and sets req.authenticatedUserId.
// sender_id is taken from the verified token — never trusted from the client body.
router.post("/requests/:id/chat", requireAuth, chatLimiter, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const r = req as typeof req & { authenticatedUserId: number };
  const senderId = r.authenticatedUserId;

  const { content } = req.body as { content: string };
  if (!content?.trim()) return res.status(400).json({ error: "content is required" });
  if (content.length > 1000) return res.status(400).json({ error: "Message too long (max 1000 chars)" });

  // Fetch request to verify it exists and get both parties for targeted delivery
  const [request] = await db
    .select({
      id: requestsTable.id,
      requester_id: requestsTable.requester_id,
      helper_id: requestsTable.helper_id,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);

  if (!request) return res.status(404).json({ error: "Request not found" });

  // Chain-aware participant check: requester, primary helper, or any chain member may chat
  const chainMembers = await db
    .select({ helper_id: requestHelpersTable.helper_id })
    .from(requestHelpersTable)
    .where(eq(requestHelpersTable.request_id, requestId));
  const chainMemberIds = new Set(chainMembers.map(m => m.helper_id));

  const isParticipant =
    senderId === request.requester_id ||
    senderId === request.helper_id ||
    chainMemberIds.has(senderId);
  if (!isParticipant) {
    return res.status(403).json({ error: "You are not a participant in this request" });
  }

  const [msg] = await db
    .insert(chatMessagesTable)
    .values({
      request_id: requestId,
      sender_id: senderId,
      content: content.trim(),
    })
    .returning();

  // Fan-out: deliver to requester, primary helper, and all chain members
  const eventPayload = { ...msg, request_id: requestId };
  const recipients = new Set<number>([request.requester_id]);
  if (request.helper_id) recipients.add(request.helper_id);
  for (const id of chainMemberIds) recipients.add(id);
  for (const recipientId of recipients) {
    sendToUser(recipientId, { type: "chat_message", payload: eventPayload });
  }

  logger.info({ request_id: requestId, sender_id: senderId }, "chat: message sent");

  return res.status(201).json(msg);
});

// PATCH /requests/:id/chat/read — mark the OTHER party's unread messages as read
// Only marks messages where sender_id != reader (i.e. messages sent to you, not by you)
router.patch("/requests/:id/chat/read", requireAuth, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  if (isNaN(requestId)) return res.status(400).json({ error: "Invalid id" });

  const r = req as typeof req & { authenticatedUserId: number };
  const readerId = r.authenticatedUserId;

  await db
    .update(chatMessagesTable)
    .set({ read_at: new Date() })
    .where(
      and(
        eq(chatMessagesTable.request_id, requestId),
        ne(chatMessagesTable.sender_id, readerId),
        isNull(chatMessagesTable.read_at),
      ),
    );

  return res.json({ ok: true });
});

export default router;
