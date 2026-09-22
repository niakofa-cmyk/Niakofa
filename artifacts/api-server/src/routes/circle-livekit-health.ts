import { Router } from "express";
import { LiveKitAPI } from "livekit-server-sdk";
import { inspectLiveKitConfig, liveKitApiHost } from "../lib/circleLiveKitHealth";
import { logger } from "../lib/logger";

const router = Router();
const LIVEKIT_TIMEOUT_MS = 3_000;

router.get("/livekit-readiness", async (_req, res) => {
  const config = inspectLiveKitConfig();
  const host = liveKitApiHost(process.env.LIVEKIT_URL);

  if (config.status !== "ready" || !host) {
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
    // listRooms proves endpoint reachability and API-key/secret authentication.
    // It does not send credentials back to the browser.
    const api = new LiveKitAPI({
      host,
      apiKey: process.env.LIVEKIT_API_KEY,
      secret: process.env.LIVEKIT_API_SECRET,
    });

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
