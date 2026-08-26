import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { and, eq, isNull } from "drizzle-orm";
import {
  audioCircleParticipantsTable,
  audioCircleSessionsTable,
  db,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { canPublishCircleMedia } from "../lib/circleMediaPolicy";
import { isValidLiveKitUrl, parsePositiveSafeInteger } from "../lib/circleMediaConfig";
import { logger } from "../lib/logger";

const router = Router();
const TOKEN_TTL_SECONDS = 60 * 60 * 4;

function roomNameForSession(sessionId: number): string {
  return `niakofa-circle-${sessionId}`;
}

router.post(
  "/audio-circle-sessions/:id/media-token",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    if (!apiKey || !apiSecret || !livekitUrl || !isValidLiveKitUrl(livekitUrl)) {
      return res.status(503).json({ error: "LiveKit is not configured on this environment" });
    }

    const sessionId = parsePositiveSafeInteger(String(req.params.id ?? ""));
    if (sessionId === null) return res.status(400).json({ error: "Invalid id" });
    const userId = req.authenticatedUserId!;

    const [session] = await db.select().from(audioCircleSessionsTable)
      .where(eq(audioCircleSessionsTable.id, sessionId)).limit(1);
    if (!session || session.status !== "live") {
      return res.status(404).json({ error: "Session not live" });
    }
    const [participant] = await db.select({ role: audioCircleParticipantsTable.role })
      .from(audioCircleParticipantsTable)
      .where(and(
        eq(audioCircleParticipantsTable.session_id, sessionId),
        eq(audioCircleParticipantsTable.user_id, userId),
        isNull(audioCircleParticipantsTable.left_at),
      )).limit(1);
    if (!participant) {
      return res.status(403).json({ error: "Join the circle before requesting a media token" });
    }

    const canPublish = canPublishCircleMedia(
      participant.role as "host" | "co_host" | "speaker" | "listener",
      (session.media_publish_policy as "open" | "moderated") ?? "open",
    );
    try {
      const accessToken = new AccessToken(apiKey, apiSecret, {
        identity: String(userId),
        ttl: TOKEN_TTL_SECONDS,
      });
      accessToken.addGrant({
        room: roomNameForSession(sessionId),
        roomJoin: true,
        canPublish,
        canPublishData: true,
        canSubscribe: true,
      });
      const token = await accessToken.toJwt();
      return res.json({
        media_url: livekitUrl,
        media_token: token,
        room_name: roomNameForSession(sessionId),
        can_publish: canPublish,
        expires_in: TOKEN_TTL_SECONDS,
      });
    } catch (error) {
      logger.error({ err: error, sessionId, userId }, "circle-media-token: failed to mint LiveKit token");
      return res.status(500).json({ error: "Failed to mint media token" });
    }
  },
);

export default router;