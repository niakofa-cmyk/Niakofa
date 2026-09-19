import { Router } from "express";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  db,
  chatMessagesTable,
  diasporaHubConversationsTable,
  diasporaHubMessagesTable,
  messageReadStatesTable,
  requestsTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { sendToUser } from "../lib/ws-hub";

const router = Router();

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function assertRequestParticipant(userId: number, requestId: number) {
  const [request] = await db.select({
    id: requestsTable.id,
    requester_id: requestsTable.requester_id,
    helper_id: requestsTable.helper_id,
  }).from(requestsTable).where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return null;
  if (request.requester_id !== userId && request.helper_id !== userId) return null;
  return request;
}

async function assertHubParticipant(userId: number, conversationId: number) {
  const [conversation] = await db.select({
    id: diasporaHubConversationsTable.id,
    hub_a_id: diasporaHubConversationsTable.hub_a_id,
    hub_b_id: diasporaHubConversationsTable.hub_b_id,
  }).from(diasporaHubConversationsTable)
    .where(eq(diasporaHubConversationsTable.id, conversationId)).limit(1);
  if (!conversation) return null;

  const membership = await db.execute(sql`
    SELECT 1
    FROM hub_memberships m
    WHERE m.user_id = ${userId}
      AND m.hub_id IN (${conversation.hub_a_id}, ${conversation.hub_b_id})
      AND m.status = 'approved'
    LIMIT 1
  `);
  return membership.rows.length ? conversation : null;
}

router.post("/messages/requests/:requestId/read", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const requestId = positiveId(req.params.requestId);
  if (!requestId) return res.status(400).json({ error: "Invalid request id." });

  const request = await assertRequestParticipant(userId, requestId);
  if (!request) return res.status(404).json({ error: "Request conversation not found." });

  const [latestIncoming] = await db.select({ id: chatMessagesTable.id, sent_at: chatMessagesTable.sent_at })
    .from(chatMessagesTable)
    .where(and(
      eq(chatMessagesTable.request_id, requestId),
      ne(chatMessagesTable.sender_id, userId),
    ))
    .orderBy(desc(chatMessagesTable.id))
    .limit(1);

  await db.insert(messageReadStatesTable).values({
    user_id: userId,
    conversation_kind: "request",
    conversation_id: requestId,
    last_read_message_id: latestIncoming?.id ?? null,
    last_read_at: new Date(),
  }).onConflictDoUpdate({
    target: [messageReadStatesTable.user_id, messageReadStatesTable.conversation_kind, messageReadStatesTable.conversation_id],
    set: {
      last_read_message_id: latestIncoming?.id ?? null,
      last_read_at: new Date(),
    },
  });

  // Request chat already has a per-message read_at field. Keep it synchronized
  // for compatibility while the cursor table is the authoritative inbox state.
  await db.update(chatMessagesTable)
    .set({ read_at: new Date() })
    .where(and(
      eq(chatMessagesTable.request_id, requestId),
      ne(chatMessagesTable.sender_id, userId),
      isNull(chatMessagesTable.read_at),
    ));

  sendToUser(userId, { type: "message_read", payload: { kind: "request", conversation_id: requestId, last_read_message_id: latestIncoming?.id ?? null } });
  return res.json({ ok: true, last_read_message_id: latestIncoming?.id ?? null });
});

router.post("/messages/hubs/:conversationId/read", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const conversationId = positiveId(req.params.conversationId);
  if (!conversationId) return res.status(400).json({ error: "Invalid Hub conversation id." });

  const conversation = await assertHubParticipant(userId, conversationId);
  if (!conversation) return res.status(404).json({ error: "Hub conversation not found." });

  const [latestIncoming] = await db.select({ id: diasporaHubMessagesTable.id, created_at: diasporaHubMessagesTable.created_at })
    .from(diasporaHubMessagesTable)
    .where(and(
      eq(diasporaHubMessagesTable.conversation_id, conversationId),
      ne(diasporaHubMessagesTable.sender_user_id, userId),
    ))
    .orderBy(desc(diasporaHubMessagesTable.id))
    .limit(1);

  await db.insert(messageReadStatesTable).values({
    user_id: userId,
    conversation_kind: "hub",
    conversation_id: conversationId,
    last_read_message_id: latestIncoming?.id ?? null,
    last_read_at: new Date(),
  }).onConflictDoUpdate({
    target: [messageReadStatesTable.user_id, messageReadStatesTable.conversation_kind, messageReadStatesTable.conversation_id],
    set: {
      last_read_message_id: latestIncoming?.id ?? null,
      last_read_at: new Date(),
    },
  });

  await db.update(diasporaHubMessagesTable)
    .set({ read_at: new Date() })
    .where(and(
      eq(diasporaHubMessagesTable.conversation_id, conversationId),
      ne(diasporaHubMessagesTable.sender_user_id, userId),
      isNull(diasporaHubMessagesTable.read_at),
    ));

  sendToUser(userId, { type: "message_read", payload: { kind: "hub", conversation_id: conversationId, last_read_message_id: latestIncoming?.id ?? null } });
  return res.json({ ok: true, last_read_message_id: latestIncoming?.id ?? null });
});

export default router;
