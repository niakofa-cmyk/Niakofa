import { Router } from "express";
import { and, asc, desc, eq, ilike, isNull, ne, or } from "drizzle-orm";
import {
  db,
  directConversationMembersTable,
  directConversationsTable,
  directMessageBlocksTable,
  directMessageReportsTable,
  directMessagesTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();
const MAX_BODY_LENGTH = 4_000;
const MAX_REPORT_LENGTH = 500;

function parsePositiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function serializeDate(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

async function isConversationMember(userId: number, conversationId: number): Promise<boolean> {
  const [member] = await db
    .select({ user_id: directConversationMembersTable.user_id })
    .from(directConversationMembersTable)
    .where(and(
      eq(directConversationMembersTable.conversation_id, conversationId),
      eq(directConversationMembersTable.user_id, userId),
    ))
    .limit(1);
  return Boolean(member);
}

async function isBlockedBetween(firstUserId: number, secondUserId: number): Promise<boolean> {
  const [block] = await db
    .select({ blocker_id: directMessageBlocksTable.blocker_id })
    .from(directMessageBlocksTable)
    .where(or(
      and(
        eq(directMessageBlocksTable.blocker_id, firstUserId),
        eq(directMessageBlocksTable.blocked_id, secondUserId),
      ),
      and(
        eq(directMessageBlocksTable.blocker_id, secondUserId),
        eq(directMessageBlocksTable.blocked_id, firstUserId),
      ),
    ))
    .limit(1);
  return Boolean(block);
}

async function getApprovedUser(userId: number) {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
      approval_status: usersTable.approval_status,
      is_suspended: usersTable.is_suspended,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user ?? null;
}

function serializeUser(user: { id: number; name: string; avatar_url: string | null }) {
  return { id: user.id, name: user.name, avatar_url: user.avatar_url };
}

router.get("/messages/direct/users", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const query = String(req.query.q ?? "").trim();
  if (query.length < 2) return res.json({ users: [] });

  const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
  const candidates = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      ne(usersTable.id, userId),
      or(ilike(usersTable.name, pattern), ilike(usersTable.email, pattern)),
    ))
    .orderBy(asc(usersTable.name))
    .limit(20);

  const users = [];
  for (const candidate of candidates) {
    if (!(await isBlockedBetween(userId, candidate.id))) users.push(serializeUser(candidate));
  }
  return res.json({ users });
});

router.get("/messages/direct/conversations", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const memberships = await db
    .select({
      conversation_id: directConversationMembersTable.conversation_id,
      updated_at: directConversationsTable.updated_at,
    })
    .from(directConversationMembersTable)
    .innerJoin(
      directConversationsTable,
      eq(directConversationsTable.id, directConversationMembersTable.conversation_id),
    )
    .where(and(
      eq(directConversationMembersTable.user_id, userId),
      eq(directConversationsTable.status, "active"),
    ))
    .orderBy(desc(directConversationsTable.updated_at))
    .limit(100);

  const conversations = [];
  for (const membership of memberships) {
    const [otherMember] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatar_url: usersTable.avatar_url,
      })
      .from(directConversationMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, directConversationMembersTable.user_id))
      .where(and(
        eq(directConversationMembersTable.conversation_id, membership.conversation_id),
        ne(directConversationMembersTable.user_id, userId),
      ))
      .limit(1);
    if (!otherMember) continue;

    const [lastMessage] = await db
      .select({
        id: directMessagesTable.id,
        body: directMessagesTable.body,
        sender_id: directMessagesTable.sender_id,
        created_at: directMessagesTable.created_at,
        read_at: directMessagesTable.read_at,
      })
      .from(directMessagesTable)
      .where(eq(directMessagesTable.conversation_id, membership.conversation_id))
      .orderBy(desc(directMessagesTable.created_at))
      .limit(1);

    conversations.push({
      id: membership.conversation_id,
      updated_at: serializeDate(membership.updated_at),
      other_user: serializeUser(otherMember),
      last_message: lastMessage ? {
        id: lastMessage.id,
        body: lastMessage.body,
        sender_id: lastMessage.sender_id,
        created_at: serializeDate(lastMessage.created_at),
        read_at: serializeDate(lastMessage.read_at),
      } : null,
    });
  }

  return res.json({ conversations });
});

router.get("/messages/direct/:conversationId", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const conversationId = parsePositiveId(req.params.conversationId);
  if (!conversationId) return res.status(400).json({ error: "Invalid conversation id." });
  if (!(await isConversationMember(userId, conversationId))) {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const [conversation] = await db
    .select({
      id: directConversationsTable.id,
      status: directConversationsTable.status,
      updated_at: directConversationsTable.updated_at,
    })
    .from(directConversationsTable)
    .where(eq(directConversationsTable.id, conversationId))
    .limit(1);
  if (!conversation || conversation.status !== "active") {
    return res.status(404).json({ error: "Conversation not found." });
  }

  const messages = await db
    .select({
      id: directMessagesTable.id,
      conversation_id: directMessagesTable.conversation_id,
      sender_id: directMessagesTable.sender_id,
      sender_name: usersTable.name,
      sender_avatar: usersTable.avatar_url,
      body: directMessagesTable.body,
      created_at: directMessagesTable.created_at,
      read_at: directMessagesTable.read_at,
    })
    .from(directMessagesTable)
    .innerJoin(usersTable, eq(usersTable.id, directMessagesTable.sender_id))
    .where(eq(directMessagesTable.conversation_id, conversationId))
    .orderBy(asc(directMessagesTable.created_at))
    .limit(100);

  await db
    .update(directMessagesTable)
    .set({ read_at: new Date() })
    .where(and(
      eq(directMessagesTable.conversation_id, conversationId),
      ne(directMessagesTable.sender_id, userId),
      isNull(directMessagesTable.read_at),
    ));

  return res.json({
    conversation: {
      ...conversation,
      updated_at: serializeDate(conversation.updated_at),
    },
    messages: messages.map((message) => ({
      ...message,
      created_at: serializeDate(message.created_at),
      read_at: serializeDate(message.read_at),
    })),
  });
});

router.post("/messages/direct", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const senderId = req.authenticatedUserId!;
  const recipientId = parsePositiveId(req.body?.recipientId);
  const body = String(req.body?.body ?? "").trim();
  if (!recipientId || recipientId === senderId) {
    return res.status(400).json({ error: "A valid different recipient is required." });
  }
  if (!body || body.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message must be 1-${MAX_BODY_LENGTH} characters.` });
  }

  const recipient = await getApprovedUser(recipientId);
  if (!recipient || recipient.approval_status !== "approved" || recipient.is_suspended) {
    return res.status(404).json({ error: "Recipient not found." });
  }
  if (await isBlockedBetween(senderId, recipientId)) {
    return res.status(403).json({ error: "Direct messaging is blocked between these accounts.", error_code: "DIRECT_MESSAGING_BLOCKED" });
  }

  const result = await db.transaction(async (tx) => {
    const mine = await tx
      .select({ conversation_id: directConversationMembersTable.conversation_id })
      .from(directConversationMembersTable)
      .innerJoin(
        directConversationsTable,
        eq(directConversationsTable.id, directConversationMembersTable.conversation_id),
      )
      .where(and(
        eq(directConversationMembersTable.user_id, senderId),
        eq(directConversationsTable.status, "active"),
      ));

    for (const membership of mine) {
      const members = await tx
        .select({ user_id: directConversationMembersTable.user_id })
        .from(directConversationMembersTable)
        .where(eq(directConversationMembersTable.conversation_id, membership.conversation_id));
      if (members.length === 2 && members.some((member) => member.user_id === recipientId)) {
        const [message] = await tx
          .insert(directMessagesTable)
          .values({ conversation_id: membership.conversation_id, sender_id: senderId, body })
          .returning();
        await tx
          .update(directConversationsTable)
          .set({ updated_at: new Date() })
          .where(eq(directConversationsTable.id, membership.conversation_id));
        return { conversationId: membership.conversation_id, message };
      }
    }

    const [conversation] = await tx.insert(directConversationsTable).values({}).returning();
    await tx.insert(directConversationMembersTable).values([
      { conversation_id: conversation.id, user_id: senderId },
      { conversation_id: conversation.id, user_id: recipientId },
    ]);
    const [message] = await tx
      .insert(directMessagesTable)
      .values({ conversation_id: conversation.id, sender_id: senderId, body })
      .returning();
    return { conversationId: conversation.id, message };
  });

  return res.status(201).json({
    conversationId: result.conversationId,
    message: {
      ...result.message,
      created_at: serializeDate(result.message.created_at),
      read_at: serializeDate(result.message.read_at),
    },
  });
});

router.post("/messages/direct/conversations/:conversationId/read", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const conversationId = parsePositiveId(req.params.conversationId);
  if (!conversationId) return res.status(400).json({ error: "Invalid conversation id." });
  if (!(await isConversationMember(userId, conversationId))) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  await db.update(directMessagesTable).set({ read_at: new Date() }).where(and(
    eq(directMessagesTable.conversation_id, conversationId),
    ne(directMessagesTable.sender_id, userId),
    isNull(directMessagesTable.read_at),
  ));
  return res.json({ ok: true });
});

router.post("/messages/direct/users/:id/block", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const blockerId = req.authenticatedUserId!;
  const blockedId = parsePositiveId(req.params.id);
  if (!blockedId || blockedId === blockerId) return res.status(400).json({ error: "Choose another approved user." });
  const blockedUser = await getApprovedUser(blockedId);
  if (!blockedUser || blockedUser.approval_status !== "approved") return res.status(404).json({ error: "User not found." });
  await db.insert(directMessageBlocksTable).values({ blocker_id: blockerId, blocked_id: blockedId }).onConflictDoNothing();
  return res.json({ blocked: true });
});

router.delete("/messages/direct/users/:id/block", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const blockerId = req.authenticatedUserId!;
  const blockedId = parsePositiveId(req.params.id);
  if (!blockedId) return res.status(400).json({ error: "Invalid user id." });
  await db.delete(directMessageBlocksTable).where(and(
    eq(directMessageBlocksTable.blocker_id, blockerId),
    eq(directMessageBlocksTable.blocked_id, blockedId),
  ));
  return res.json({ blocked: false });
});

router.post("/messages/direct/conversations/:conversationId/report", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const reporterId = req.authenticatedUserId!;
  const conversationId = parsePositiveId(req.params.conversationId);
  const reason = String(req.body?.reason ?? "").trim();
  const messageId = req.body?.messageId === undefined ? null : parsePositiveId(req.body.messageId);
  if (!conversationId) return res.status(400).json({ error: "Invalid conversation id." });
  if (!reason || reason.length > MAX_REPORT_LENGTH) {
    return res.status(400).json({ error: `Report reason must be 1-${MAX_REPORT_LENGTH} characters.` });
  }
  if (!(await isConversationMember(reporterId, conversationId)) || (req.body?.messageId !== undefined && !messageId)) {
    return res.status(404).json({ error: "Conversation not found." });
  }
  if (messageId) {
    const [message] = await db
      .select({ id: directMessagesTable.id })
      .from(directMessagesTable)
      .where(and(
        eq(directMessagesTable.id, messageId),
        eq(directMessagesTable.conversation_id, conversationId),
      ))
      .limit(1);
    if (!message) return res.status(404).json({ error: "Message not found." });
  }
  const [report] = await db.insert(directMessageReportsTable).values({
    reporter_id: reporterId,
    conversation_id: conversationId,
    message_id: messageId,
    reason,
  }).returning({ id: directMessageReportsTable.id, created_at: directMessageReportsTable.created_at });
  return res.status(201).json({ report: { id: report.id, created_at: serializeDate(report.created_at) } });
});

export default router;