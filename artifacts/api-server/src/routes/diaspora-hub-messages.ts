import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  diasporaHubsTable,
  diasporaHubConversationsTable,
  diasporaHubMessagesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();

type HubSummary = {
  id: number;
  name: string;
  display_name: string | null;
  region: string;
  hub_scope: string;
  country_code: string | null;
  subdivision_code: string | null;
};

const hubSummary = {
  id: diasporaHubsTable.id,
  name: diasporaHubsTable.name,
  display_name: diasporaHubsTable.display_name,
  region: diasporaHubsTable.region_label,
  hub_scope: diasporaHubsTable.hub_scope,
  country_code: diasporaHubsTable.country_code,
  subdivision_code: diasporaHubsTable.subdivision_code,
};

async function canRepresentHub(userId: number, hubId: number): Promise<boolean> {
  const rows = await db.execute<{ allowed: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM diaspora_hubs h
      JOIN users u ON u.id = ${userId}
      WHERE h.id = ${hubId}
        AND h.status = 'approved'
        AND (
          (h.community_id IS NOT NULL AND h.community_id = u.community_id)
          OR EXISTS (
            SELECT 1
            FROM hub_community_leaders hcl
            WHERE hcl.hub_id = h.id
              AND hcl.user_id = u.id
              AND hcl.approved = TRUE
          )
        )
    ) AS allowed
  `);
  return rows.rows[0]?.allowed === true;
}

async function getApprovedHub(hubId: number): Promise<HubSummary | null> {
  const [hub] = await db
    .select(hubSummary)
    .from(diasporaHubsTable)
    .where(and(eq(diasporaHubsTable.id, hubId), eq(diasporaHubsTable.status, "approved")))
    .limit(1);
  return hub ?? null;
}

function parsePositiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function serializeMessage(message: {
  id: number;
  conversation_id: number;
  sender_user_id: number | null;
  sender_hub_id: number;
  body: string;
  created_at: Date;
  sender_name: string | null;
  sender_hub_name: string | null;
}) {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    sender_user_id: message.sender_user_id,
    sender_hub_id: message.sender_hub_id,
    sender_hub_name: message.sender_hub_name ?? "Diaspora Hub",
    sender_name: message.sender_name ?? "Hub member",
    body: message.body,
    created_at: message.created_at.toISOString(),
  };
}

// GET /api/diaspora/hub-messages/options
// Returns hubs the member can represent and approved hubs they can contact.
router.get("/diaspora/hub-messages/options", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const [sourceRows, targetRows] = await Promise.all([
    db.execute<HubSummary>(sql`
      SELECT DISTINCT h.id, h.name, h.display_name, h.region_label AS region,
        h.hub_scope, h.country_code, h.subdivision_code
      FROM diaspora_hubs h
      JOIN users u ON u.id = ${userId}
      WHERE h.status = 'approved'
        AND (
          (h.community_id IS NOT NULL AND h.community_id = u.community_id)
          OR EXISTS (
            SELECT 1 FROM hub_community_leaders hcl
            WHERE hcl.hub_id = h.id AND hcl.user_id = u.id AND hcl.approved = TRUE
          )
        )
      ORDER BY h.display_name NULLS LAST, h.name
    `),
    db.select(hubSummary)
      .from(diasporaHubsTable)
      .where(eq(diasporaHubsTable.status, "approved"))
      .orderBy(diasporaHubsTable.display_name, diasporaHubsTable.name),
  ]);
  return res.json({ source_hubs: sourceRows.rows, target_hubs: targetRows });
});

// POST /api/diaspora/hub-messages/conversations
router.post("/diaspora/hub-messages/conversations", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sourceId = parsePositiveId(req.body?.source_hub_id);
  const targetId = parsePositiveId(req.body?.target_hub_id);
  if (!sourceId || !targetId || sourceId === targetId) {
    return res.status(400).json({ error: "Choose two different approved Hubs." });
  }
  if (!(await canRepresentHub(userId, sourceId))) {
    return res.status(403).json({ error: "You need approved membership in the sending Hub." });
  }
  const [source, target] = await Promise.all([getApprovedHub(sourceId), getApprovedHub(targetId)]);
  if (!source || !target) return res.status(404).json({ error: "Hub not found." });
  const [hubA, hubB] = sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
  const [conversation] = await db
    .insert(diasporaHubConversationsTable)
    .values({ hub_a_id: hubA, hub_b_id: hubB, created_by: userId })
    .onConflictDoNothing({ target: [diasporaHubConversationsTable.hub_a_id, diasporaHubConversationsTable.hub_b_id] })
    .returning();
  const existing = conversation ?? (await db
    .select()
    .from(diasporaHubConversationsTable)
    .where(and(eq(diasporaHubConversationsTable.hub_a_id, hubA), eq(diasporaHubConversationsTable.hub_b_id, hubB)))
    .limit(1))[0];
  if (!existing) return res.status(500).json({ error: "Could not open Hub conversation." });
  return res.status(conversation ? 201 : 200).json({
    conversation: { ...existing, source_hub: source, target_hub: target },
  });
});

// GET /api/diaspora/hub-messages/conversations/:id
router.get("/diaspora/hub-messages/conversations/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const conversationId = parsePositiveId(req.params.id);
  if (!conversationId) return res.status(400).json({ error: "Invalid conversation id." });
  const [conversation] = await db
    .select()
    .from(diasporaHubConversationsTable)
    .where(eq(diasporaHubConversationsTable.id, conversationId))
    .limit(1);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  const [canReadA, canReadB] = await Promise.all([
    canRepresentHub(userId, conversation.hub_a_id),
    canRepresentHub(userId, conversation.hub_b_id),
  ]);
  if (!canReadA && !canReadB) return res.status(403).json({ error: "You are not a member of either Hub." });
  const [hubA, hubB, rows] = await Promise.all([
    getApprovedHub(conversation.hub_a_id),
    getApprovedHub(conversation.hub_b_id),
    db.select({
      id: diasporaHubMessagesTable.id,
      conversation_id: diasporaHubMessagesTable.conversation_id,
      sender_user_id: diasporaHubMessagesTable.sender_user_id,
      sender_hub_id: diasporaHubMessagesTable.sender_hub_id,
      body: diasporaHubMessagesTable.body,
      created_at: diasporaHubMessagesTable.created_at,
      sender_name: usersTable.name,
      sender_hub_name: diasporaHubsTable.display_name,
    })
      .from(diasporaHubMessagesTable)
      .leftJoin(usersTable, eq(usersTable.id, diasporaHubMessagesTable.sender_user_id))
      .leftJoin(diasporaHubsTable, eq(diasporaHubsTable.id, diasporaHubMessagesTable.sender_hub_id))
      .where(eq(diasporaHubMessagesTable.conversation_id, conversationId))
      .orderBy(diasporaHubMessagesTable.created_at)
      .limit(100),
  ]);
  return res.json({
    conversation: { ...conversation, hub_a: hubA, hub_b: hubB },
    messages: rows.map(serializeMessage),
  });
});

// POST /api/diaspora/hub-messages/conversations/:id/messages
router.post("/diaspora/hub-messages/conversations/:id/messages", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const conversationId = parsePositiveId(req.params.id);
  const senderHubId = parsePositiveId(req.body?.sender_hub_id);
  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 2000) : "";
  if (!conversationId || !senderHubId || !body) return res.status(400).json({ error: "A Hub and message are required." });
  const [conversation] = await db
    .select()
    .from(diasporaHubConversationsTable)
    .where(eq(diasporaHubConversationsTable.id, conversationId))
    .limit(1);
  if (!conversation) return res.status(404).json({ error: "Conversation not found." });
  if (![conversation.hub_a_id, conversation.hub_b_id].includes(senderHubId)) {
    return res.status(400).json({ error: "Sender Hub is not part of this conversation." });
  }
  if (!(await canRepresentHub(userId, senderHubId))) {
    return res.status(403).json({ error: "You need approved membership in the sending Hub." });
  }
  const [saved] = await db.transaction(async (tx) => {
    const [message] = await tx.insert(diasporaHubMessagesTable).values({
      conversation_id: conversationId,
      sender_user_id: userId,
      sender_hub_id: senderHubId,
      body,
    }).returning();
    await tx.update(diasporaHubConversationsTable)
      .set({ last_message_at: message?.created_at ?? new Date() })
      .where(eq(diasporaHubConversationsTable.id, conversationId));
    return [message];
  });
  if (!saved) return res.status(500).json({ error: "Message could not be saved." });
  const [sender] = await db.select({
    id: diasporaHubMessagesTable.id,
    conversation_id: diasporaHubMessagesTable.conversation_id,
    sender_user_id: diasporaHubMessagesTable.sender_user_id,
    sender_hub_id: diasporaHubMessagesTable.sender_hub_id,
    body: diasporaHubMessagesTable.body,
    created_at: diasporaHubMessagesTable.created_at,
    sender_name: usersTable.name,
    sender_hub_name: diasporaHubsTable.display_name,
  }).from(diasporaHubMessagesTable)
    .leftJoin(usersTable, eq(usersTable.id, diasporaHubMessagesTable.sender_user_id))
    .leftJoin(diasporaHubsTable, eq(diasporaHubsTable.id, diasporaHubMessagesTable.sender_hub_id))
    .where(eq(diasporaHubMessagesTable.id, saved.id))
    .limit(1);
  return res.status(201).json({ message: sender ? serializeMessage(sender) : null });
});

export default router;