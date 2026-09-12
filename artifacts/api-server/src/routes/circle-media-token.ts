import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { and, eq, isNull } from "drizzle-orm";
import {
  audioCircleParticipantsTable,
  audioCircleSessionsTable,
  db,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { circleMediaTokenLimiter } from "../middlewares/rate-limit.hardened";
import { canPublishCircleMedia } from "../lib/circleMediaPolicy";
import { isValidLiveKitUrl, parsePositiveSafeInteger } from "../lib/circleMediaConfig";
import {
  MAX_SESSION_DURATION_MS,
  isSessionPastMaxDuration,
  remainingSessionTokenTtlSeconds,
} from "../lib/circleSessionLifecycle";
import { logger } from "../lib/logger";

const router = Router();

function roomNameForSession(sessionId: number): string {
  return `niakofa-circle-${sessionId}`;
}

router.post(
  "/audio-circle-sessions/:id/media-token",
  requireAuth,
  requireApproved,
  circleMediaTokenLimiter,
  async (req, res) => {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    if (
      !apiKey ||
      !apiSecret ||
      !livekitUrl ||
      !isValidLiveKitUrl(livekitUrl, {
        allowLocalWs: process.env.NODE_ENV !== "production",
      })
    ) {
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
    if (isSessionPastMaxDuration(session.started_at)) {
      return res.status(410).json({
        error: "This Spiral has reached its 4-hour maximum duration",
        code: "SESSION_MAX_DURATION",
      });
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

    // Token lasts for the rest of this Spiral (up to 4h). No mid-session
    // refresh is required; Host and listeners stay on the same LiveKit room.
    const tokenTtlSeconds = remainingSessionTokenTtlSeconds(session.started_at);
    if (tokenTtlSeconds <= 0) {
      return res.status(410).json({
        error: "This Spiral has reached its 4-hour maximum duration",
        code: "SESSION_MAX_DURATION",
      });
    }

    try {
      const accessToken = new AccessToken(apiKey, apiSecret, {
        identity: String(userId),
        ttl: tokenTtlSeconds,
      });
      // Explicitly constrain publishers to the media sources the product supports.
      // This prevents a future client/SDK feature from silently granting additional
      // publish capabilities while preserving the locked no-refresh session model.
      accessToken.addGrant({
        room: roomNameForSession(sessionId),
        roomJoin: true,
        canPublish,
        canPublishData: true,
        canSubscribe: true,
        ...(canPublish
          ? {
              canPublishSources: ["camera", "microphone", "screen_share"] as string[],
            }
          : {}),
      } as Parameters<AccessToken["addGrant"]>[0]);
      const token = await accessToken.toJwt();
      return res.json({
        media_url: livekitUrl,
        media_token: token,
        room_name: roomNameForSession(sessionId),
        can_publish: canPublish,
        expires_in: tokenTtlSeconds,
        session_max_seconds: Math.floor(MAX_SESSION_DURATION_MS / 1000),
        // Explicit: clients should NOT disconnect/reconnect for token refresh
        // during a normal Spiral; credentials cover the remaining session.
        refresh_required: false,
      });
    } catch (error) {
      logger.error({ err: error, sessionId, userId }, "circle-media-token: failed to mint LiveKit token");
      return res.status(500).json({ error: "Failed to mint media token" });
    }
  },
);

export default router;
