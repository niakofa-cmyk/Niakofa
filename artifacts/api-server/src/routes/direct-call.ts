import { Router } from "express";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  directConversationMembersTable,
  directConversationsTable,
  directMessageBlocksTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { isValidLiveKitUrl } from "../lib/circleMediaConfig";
import { logger } from "../lib/logger";

const router = Router();
const CALL_ID_RE = /^[A-Za-z0-9_-]{12,80}$/;
const MAX_CALL_TTL_SECONDS = 30 * 60;

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function roomName(conversationId: number, callId: string): string {
  return `niakofa-dm-${conversationId}-${callId}`;
}

router.post(
  "/messages/direct/:conversationId/call-token",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !livekitUrl || !isValidLiveKitUrl(livekitUrl, { allowLocalWs: process.env.NODE_ENV !== "production" })) {
      return res.status(503).json({ error: "Direct calling is not configured on this environment", code: "RTC_NOT_CONFIGURED" });
    }

    const conversationId = positiveId(req.params.conversationId);
    const callId = String(req.body?.callId ?? "");
    const mode = req.body?.mode === "video" ? "video" : req.body?.mode === "voice" ? "voice" : null;
    if (!conversationId || !CALL_ID_RE.test(callId) || !mode) {
      return res.status(400).json({ error: "Valid conversation, call id, and call mode are required." });
    }

    const userId = req.authenticatedUserId!;
    const [member] = await db.select({ conversation_id: directConversationMembersTable.conversation_id })
      .from(directConversationMembersTable)
      .innerJoin(directConversationsTable, eq(directConversationsTable.id, directConversationMembersTable.conversation_id))
      .where(and(
        eq(directConversationMembersTable.conversation_id, conversationId),
        eq(directConversationMembersTable.user_id, userId),
        eq(directConversationsTable.status, "active"),
      )).limit(1);
    if (!member) return res.status(404).json({ error: "Conversation not found." });

    const otherMembers = await db.select({ user_id: directConversationMembersTable.user_id })
      .from(directConversationMembersTable)
      .where(eq(directConversationMembersTable.conversation_id, conversationId));
    const otherUserId = otherMembers.find((row) => row.user_id !== userId)?.user_id;
    if (!otherUserId) return res.status(409).json({ error: "Direct call requires exactly two conversation members." });
    const [block] = await db.select({ blocker_id: directMessageBlocksTable.blocker_id })
      .from(directMessageBlocksTable)
      .where(sql`(${directMessageBlocksTable.blocker_id} = ${userId} AND ${directMessageBlocksTable.blocked_id} = ${otherUserId}) OR (${directMessageBlocksTable.blocker_id} = ${otherUserId} AND ${directMessageBlocksTable.blocked_id} = ${userId})`)
      .limit(1);
    if (block) return res.status(403).json({ error: "Direct calling is blocked between these accounts.", code: "DIRECT_CALL_BLOCKED" });

    try {
      const token = new AccessToken(apiKey, apiSecret, {
        identity: String(userId),
        ttl: MAX_CALL_TTL_SECONDS,
      });
      token.addGrant({
        room: roomName(conversationId, callId),
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
      } as Parameters<AccessToken["addGrant"]>[0]);
      return res.json({
        media_url: livekitUrl,
        media_token: await token.toJwt(),
        room_name: roomName(conversationId, callId),
        call_id: callId,
        mode,
        expires_in: MAX_CALL_TTL_SECONDS,
      });
    } catch (error) {
      logger.error({ err: error, conversationId, userId }, "direct-call: failed to mint token");
      return res.status(500).json({ error: "Failed to create direct call session." });
    }
  },
);

export default router;
