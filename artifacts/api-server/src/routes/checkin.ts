/**
 * Internal Nia check-in trigger endpoint.
 * Auth: requires x-internal-secret header matching INTERNAL_SECRET env var
 * (service-to-service auth, called by the nia-checkin-worker).
 */
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { logger } from "../lib/logger";
import { requestNia } from "../lib/nia-client";

const router = Router();

function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.INTERNAL_SECRET;
  const provided = req.headers["x-internal-secret"];
  if (!expected || provided !== expected) {
    res.status(403).json({ error: "Unauthorized — invalid internal secret" });
    return;
  }
  next();
}

interface CheckinPayload {
  userId: number;
  requestId: number;
  requestTitle: string;
  category: string;
  helperName?: string | null;
  sessionId: string;
}

router.post("/", verifyInternalSecret, async (req: Request, res: Response) => {
  const payload = req.body as CheckinPayload;
  const { userId, requestId, requestTitle, category, helperName, sessionId } = payload ?? {};
  if (
    typeof userId !== "number" ||
    typeof requestId !== "number" ||
    typeof requestTitle !== "string" ||
    typeof category !== "string" ||
    typeof sessionId !== "string"
  ) {
    res.status(400).json({ error: "Missing or invalid fields: userId, requestId, requestTitle, category, sessionId" });
    return;
  }

  try {
    const response = await requestNia("/checkin", {
      method: "POST",
      body: JSON.stringify({ userId, requestId, requestTitle, category, helperName, sessionId }),
    }, 15_000);
    const result = await response.json().catch(() => ({})) as { nia_response?: string; error?: string };
    if (!response.ok || typeof result.nia_response !== "string") {
      return res.status(response.status >= 400 ? response.status : 502).json({
        error: result.error ?? "Failed to generate check-in message",
      });
    }

    return res.status(200).json({ success: true, userId, requestId, sessionId, nia_response: result.nia_response });
  } catch (err) {
    logger.error({ err, userId, requestId, sessionId }, "checkin: failed to generate message");
    return res.status(500).json({ error: "Failed to generate check-in message" });
  }
});

export default router;
