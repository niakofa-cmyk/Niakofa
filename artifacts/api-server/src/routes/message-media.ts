import { Router } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  directConversationMembersTable,
  directMessageAttachmentsTable,
  directMessagesTable,
  directConversationsTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/messages/direct/:conversationId/media", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const conversationId = positiveId(req.params.conversationId);
  if (!conversationId) return res.status(400).json({ error: "Invalid conversation id." });

  const [membership] = await db.select({ conversation_id: directConversationMembersTable.conversation_id })
    .from(directConversationMembersTable)
    .innerJoin(directConversationsTable, eq(directConversationsTable.id, directConversationMembersTable.conversation_id))
    .where(and(
      eq(directConversationMembersTable.conversation_id, conversationId),
      eq(directConversationMembersTable.user_id, userId),
      eq(directConversationsTable.status, "active"),
    )).limit(1);
  if (!membership) return res.status(404).json({ error: "Conversation not found." });

  const rows = await db.select({
    id: directMessageAttachmentsTable.id,
    message_id: directMessageAttachmentsTable.message_id,
    mime_type: directMessageAttachmentsTable.mime_type,
    byte_size: directMessageAttachmentsTable.byte_size,
    original_name: directMessageAttachmentsTable.original_name,
    alt_text: directMessageAttachmentsTable.alt_text,
    created_at: directMessagesTable.created_at,
  }).from(directMessageAttachmentsTable)
    .innerJoin(directMessagesTable, eq(directMessagesTable.id, directMessageAttachmentsTable.message_id))
    .where(eq(directMessagesTable.conversation_id, conversationId))
    .orderBy(asc(directMessagesTable.created_at), asc(directMessageAttachmentsTable.id));

  const media = rows.map((row) => ({
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    media_url: `/api/messages/direct/attachments/${row.id}`,
  }));

  return res.json({ media });
});

export default router;
