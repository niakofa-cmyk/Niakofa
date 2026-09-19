import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, asc, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  directConversationMembersTable,
  directConversationsTable,
  directMessageAttachmentsTable,
  directMessageBlocksTable,
  directMessageReportsTable,
  directMessagesTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { deleteAsset, putAsset, streamOrRedirectAsset } from "../lib/storage";
import { sendToUsers } from "../lib/ws-hub";

const router = Router();
const MAX_BODY_LENGTH = 4_000;
const MAX_REPORT_LENGTH = 500;
const MAX_DIRECT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_DIRECT_ATTACHMENTS = 5;
const MAX_DIRECT_ATTACHMENT_DATA_URL_LENGTH = 7_500_000;
const DIRECT_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
]);
const DIRECT_ATTACHMENT_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "application/pdf": "pdf",
};

type DecodedDirectAttachment = {
  buffer: Buffer;
  mimeType: string;
  originalName: string | null;
  altText: string | null;
};

function hasExpectedSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/gif") return buffer.subarray(0, 4).toString("ascii") === "GIF8";
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (mimeType === "video/mp4") return buffer.subarray(4, 16).toString("ascii").includes("ftyp");
  if (mimeType === "video/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (mimeType === "audio/ogg") return buffer.subarray(0, 4).toString("ascii") === "OggS";
  if (mimeType === "audio/wav") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE";
  if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "audio/mpeg") {
    return buffer.subarray(0, 3).toString("ascii") === "ID3"
      || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  return false;
}

function cleanAttachmentText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
  return cleaned || null;
}

function decodeDirectAttachment(value: unknown): DecodedDirectAttachment | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { data_url?: unknown; original_name?: unknown; alt_text?: unknown };
  if (typeof candidate.data_url !== "string" || candidate.data_url.length > MAX_DIRECT_ATTACHMENT_DATA_URL_LENGTH) return null;
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(candidate.data_url);
  if (!match || !DIRECT_ATTACHMENT_TYPES.has(match[1])) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_DIRECT_ATTACHMENT_BYTES || !hasExpectedSignature(buffer, match[1])) return null;
  return {
    buffer,
    mimeType: match[1],
    originalName: cleanAttachmentText(candidate.original_name, 255),
    altText: cleanAttachmentText(candidate.alt_text, 500),
  };
}

function parseDirectAttachments(value: unknown): { attachments: DecodedDirectAttachment[]; error?: string } {
  if (value === undefined) return { attachments: [] };
  if (!Array.isArray(value) || value.length > MAX_DIRECT_ATTACHMENTS) {
    return { attachments: [], error: `A message can include at most ${MAX_DIRECT_ATTACHMENTS} attachments.` };
  }
  const attachments: DecodedDirectAttachment[] = [];
  for (const incoming of value) {
    const decoded = decodeDirectAttachment(incoming);
    if (!decoded) {
      return { attachments: [], error: "Unsupported attachment type, invalid file data, or file is larger than 5 MB." };
    }
    attachments.push(decoded);
  }
  return { attachments };
}

function serializeAttachment(attachment: {
  id: number;
  message_id: number;
  mime_type: string;
  byte_size: number;
  original_name: string | null;
  alt_text: string | null;
}) {
  return {
    ...attachment,
    media_url: `/api/messages/direct/attachments/${attachment.id}`,
  };
}

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


router.get("/messages/direct/search", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const query = String(req.query.q ?? "").trim();
  if (query.length < 2) return res.json({ results: [] });

  const pattern = `%${query.replace(/[%_]/g, "\\router.get("/messages/direct/conversations", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {")}%`;
  const memberships = await db
    .select({ conversation_id: directConversationMembersTable.conversation_id })
    .from(directConversationMembersTable)
    .innerJoin(
      directConversationsTable,
      eq(directConversationsTable.id, directConversationMembersTable.conversation_id),
    )
    .where(and(
      eq(directConversationMembersTable.user_id, userId),
      eq(directConversationsTable.status, "active"),
    ))
    .limit(100);

  const conversationIds = memberships.map((row) => row.conversation_id);
  if (conversationIds.length === 0) return res.json({ results: [] });

  const messages = await db
    .select({
      id: directMessagesTable.id,
      conversation_id: directMessagesTable.conversation_id,
      sender_id: directMessagesTable.sender_id,
      sender_name: usersTable.name,
      sender_avatar: usersTable.avatar_url,
      body: directMessagesTable.body,
      created_at: directMessagesTable.created_at,
    })
    .from(directMessagesTable)
    .innerJoin(usersTable, eq(usersTable.id, directMessagesTable.sender_id))
    .where(and(
      inArray(directMessagesTable.conversation_id, conversationIds),
      ilike(directMessagesTable.body, pattern),
    ))
    .orderBy(desc(directMessagesTable.created_at))
    .limit(30);

  const peerByConversation = new Map<number, { id: number; name: string; avatar_url: string | null }>();
  for (const conversationId of conversationIds) {
    const [peer] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatar_url: usersTable.avatar_url,
      })
      .from(directConversationMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, directConversationMembersTable.user_id))
      .where(and(
        eq(directConversationMembersTable.conversation_id, conversationId),
        ne(directConversationMembersTable.user_id, userId),
      ))
      .limit(1);
    if (peer && !(await isBlockedBetween(userId, peer.id))) peerByConversation.set(conversationId, peer);
  }

  return res.json({
    results: messages
      .filter((message) => peerByConversation.has(message.conversation_id))
      .map((message) => ({
        conversation_id: message.conversation_id,
        message_id: message.id,
        sender_id: message.sender_id,
        sender_name: message.sender_name,
        sender_avatar: message.sender_avatar,
        body: message.body,
        created_at: serializeDate(message.created_at),
        peer: peerByConversation.get(message.conversation_id),
      })),
  });
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

    const [attachmentSummary] = lastMessage
      ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(directMessageAttachmentsTable)
        .where(eq(directMessageAttachmentsTable.message_id, lastMessage.id))
      : [{ count: 0 }];

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
        attachment_count: Number(attachmentSummary?.count ?? 0),
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

  const messageIds = messages.map((message) => message.id);
  const attachments = messageIds.length
    ? await db
      .select({
        id: directMessageAttachmentsTable.id,
        message_id: directMessageAttachmentsTable.message_id,
        mime_type: directMessageAttachmentsTable.mime_type,
        byte_size: directMessageAttachmentsTable.byte_size,
        original_name: directMessageAttachmentsTable.original_name,
        alt_text: directMessageAttachmentsTable.alt_text,
      })
      .from(directMessageAttachmentsTable)
      .where(inArray(directMessageAttachmentsTable.message_id, messageIds))
    : [];
  const attachmentsByMessage = new Map<number, ReturnType<typeof serializeAttachment>[]>();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.message_id) ?? [];
    list.push(serializeAttachment(attachment));
    attachmentsByMessage.set(attachment.message_id, list);
  }

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
      attachments: attachmentsByMessage.get(message.id) ?? [],
    })),
  });
});

router.post("/messages/direct", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const senderId = req.authenticatedUserId!;
  const recipientId = parsePositiveId(req.body?.recipientId);
  const body = String(req.body?.body ?? "").trim();
  const parsedAttachments = parseDirectAttachments(req.body?.attachments);
  if (!recipientId || recipientId === senderId) {
    return res.status(400).json({ error: "A valid different recipient is required." });
  }
  if (parsedAttachments.error) {
    return res.status(400).json({ error: parsedAttachments.error });
  }
  if ((!body && parsedAttachments.attachments.length === 0) || body.length > MAX_BODY_LENGTH) {
    return res.status(400).json({ error: `Message must include text or an attachment, with text up to ${MAX_BODY_LENGTH} characters.` });
  }

  const recipient = await getApprovedUser(recipientId);
  if (!recipient || recipient.approval_status !== "approved" || recipient.is_suspended) {
    return res.status(404).json({ error: "Recipient not found." });
  }
  if (await isBlockedBetween(senderId, recipientId)) {
    return res.status(403).json({ error: "Direct messaging is blocked between these accounts.", error_code: "DIRECT_MESSAGING_BLOCKED" });
  }
  const sender = await getApprovedUser(senderId);
  const storedKeys: string[] = [];

  try {
    const result = await db.transaction(async (tx) => {
      const persistAttachments = async (messageId: number, conversationId: number) => {
        const persisted = [];
        for (const attachment of parsedAttachments.attachments) {
          const extension = DIRECT_ATTACHMENT_EXTENSIONS[attachment.mimeType] ?? "bin";
          const storageKey = `direct-messages/${conversationId}/${randomUUID()}.${extension}`;
          await putAsset(storageKey, attachment.buffer, attachment.mimeType);
          storedKeys.push(storageKey);
          const [row] = await tx.insert(directMessageAttachmentsTable).values({
            message_id: messageId,
            storage_key: storageKey,
            mime_type: attachment.mimeType,
            byte_size: attachment.buffer.length,
            original_name: attachment.originalName,
            alt_text: attachment.altText,
          }).returning({
            id: directMessageAttachmentsTable.id,
            message_id: directMessageAttachmentsTable.message_id,
            mime_type: directMessageAttachmentsTable.mime_type,
            byte_size: directMessageAttachmentsTable.byte_size,
            original_name: directMessageAttachmentsTable.original_name,
            alt_text: directMessageAttachmentsTable.alt_text,
          });
          persisted.push(serializeAttachment(row));
        }
        return persisted;
      };

      const createMessage = async (conversationId: number) => {
        const [message] = await tx
          .insert(directMessagesTable)
          .values({ conversation_id: conversationId, sender_id: senderId, body })
          .returning();
        const attachments = await persistAttachments(message.id, conversationId);
        await tx
          .update(directConversationsTable)
          .set({ updated_at: new Date() })
          .where(eq(directConversationsTable.id, conversationId));
        return { conversationId, message, attachments };
      };

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
          return createMessage(membership.conversation_id);
        }
      }

      const [conversation] = await tx.insert(directConversationsTable).values({}).returning();
      await tx.insert(directConversationMembersTable).values([
        { conversation_id: conversation.id, user_id: senderId },
        { conversation_id: conversation.id, user_id: recipientId },
      ]);
      return createMessage(conversation.id);
    });

    const message = {
      ...result.message,
      sender_name: sender?.name ?? "Unknown",
      sender_avatar: sender?.avatar_url ?? null,
      created_at: serializeDate(result.message.created_at),
      read_at: serializeDate(result.message.read_at),
      attachments: result.attachments,
    };

    sendToUsers([senderId, recipientId], {
      type: "direct_message",
      payload: {
        conversation_id: result.conversationId,
        message,
      },
    });

    return res.status(201).json({
      conversationId: result.conversationId,
      message,
    });
  } catch (error) {
    await Promise.all(storedKeys.map((storageKey) => deleteAsset(storageKey)));
    throw error;
  }
});

router.get("/messages/direct/attachments/:attachmentId", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const attachmentId = parsePositiveId(req.params.attachmentId);
  if (!attachmentId) return res.status(400).json({ error: "Invalid attachment id." });

  const [row] = await db
    .select({
      storage_key: directMessageAttachmentsTable.storage_key,
      conversation_id: directConversationsTable.id,
    })
    .from(directMessageAttachmentsTable)
    .innerJoin(directMessagesTable, eq(directMessagesTable.id, directMessageAttachmentsTable.message_id))
    .innerJoin(directConversationsTable, eq(directConversationsTable.id, directMessagesTable.conversation_id))
    .where(eq(directMessageAttachmentsTable.id, attachmentId))
    .limit(1);
  if (!row || !(await isConversationMember(userId, row.conversation_id))) {
    return res.status(404).json({ error: "Attachment not found." });
  }

  return streamOrRedirectAsset(row.storage_key, res);
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