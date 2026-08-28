import { Router } from "express";
import { LiveKitAPI } from "livekit-server-sdk";
import { inspectLiveKitConfig, sanitizeLiveKitHost } from "../lib/circleLiveKitHealth";
import { logger } from "../lib/logger";

const router = Router();
const LIVEKIT_TIMEOUT_MS = 3_000;

/**
 * Bounded server-side LiveKit readiness probe.
 *
 * This endpoint deliberately exposes only safe diagnostics. It never returns
 * API keys, API secrets, JWTs, or Railway credentials.
 */
router.get("/livekit-readiness", async (_req, res) => {
  const config = inspectLiveKitConfig();
  const host = sanitizeLiveKitHost(process.env.LIVEKIT_URL);

  if (config.status !== "ready") {
    return res.status(503).json({
      status: "degraded",
      service: "livekit",
      config,
      reachability: "not-tested",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVEKIT_TIMEOUT_MS);

  try {
    // The server SDK uses the HTTPS API host derived from the configured
    // LiveKit endpoint. listRooms proves both endpoint reachability and that
    // the API key/secret can authenticate against the LiveKit service.
    const api = new LiveKitAPI({
      host: host ?? undefined,
      apiKey: process.env.LIVEKIT_API_KEY,
      secret: process.env.LIVEKIT_API_SECRET,
    });

    // listRooms has no client-side AbortSignal in the SDK. Race it against a
    // bounded timer so a broken upstream never makes the health endpoint hang.
    const rooms = await Promise.race([
      api.room.listRooms(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("LiveKit readiness probe timed out"));
        }, { once: true });
      }),
    ]);

    return res.status(200).json({
      status: "ready",
      service: "livekit",
      config,
      reachability: "authenticated",
      activeRooms: rooms.length,
    });
  } catch (error) {
    logger.warn({ err: error }, "livekit-readiness: LiveKit API probe failed");
    return res.status(503).json({
      status: "degraded",
      service: "livekit",
      config,
      reachability: "failed",
      error: "LiveKit endpoint is unreachable or server credentials were rejected",
    });
  } finally {
    clearTimeout(timeout);
  }
});

export default router;
