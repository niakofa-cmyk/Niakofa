import { Router } from "express";
import { AccessToken, TrackSource } from "livekit-server-sdk";
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
  MEDIA_TOKEN_REFRESH_BEFORE_SECONDS,
  MEDIA_TOKEN_TTL_SECONDS,
  MAX_SESSION_DURATION_MS,
  isSessionPastMaxDuration,
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
    try {
      const accessToken = new AccessToken(apiKey, apiSecret, {
        identity: String(userId),
        ttl: MEDIA_TOKEN_TTL_SECONDS,
      });
      accessToken.addGrant({
        room: roomNameForSession(sessionId),
        roomJoin: true,
        canPublish,
        canPublishData: true,
        canSubscribe: true,
        canPublishSources: canPublish
          ? [TrackSource.CAMERA, TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE]
          : undefined,
      });
      const token = await accessToken.toJwt();
      // Short-lived credentials; the live Spiral itself may continue up to 4 hours.
      // Clients must re-call this endpoint before expires_in elapses.
      return res.json({
        media_url: livekitUrl,
        media_token: token,
        room_name: roomNameForSession(sessionId),
        can_publish: canPublish,
        expires_in: MEDIA_TOKEN_TTL_SECONDS,
        refresh_before_seconds: MEDIA_TOKEN_REFRESH_BEFORE_SECONDS,
        session_max_seconds: Math.floor(MAX_SESSION_DURATION_MS / 1000),
      });
    } catch (error) {
      logger.error({ err: error, sessionId, userId }, "circle-media-token: failed to mint LiveKit token");
      return res.status(500).json({ error: "Failed to mint media token" });
    }
  },
);

export default router;
