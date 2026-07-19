/**
 * POST /knowledge-refresh
 *
 * Admin-triggered immediate learning cycle.
 * Called by api-server's admin endpoint (POST /api/nia/knowledge-refresh).
 * Requires x-internal-secret header for service-to-service auth.
 *
 * Runs triggerLearningCycle() synchronously (within the request window) so
 * the admin gets a clear success/failure signal rather than a deferred job.
 * The full cycle can take ~5 minutes (30s gap × 7 topics) — this is expected.
 */
import { Router, Request, Response, NextFunction } from "express";
import { pino } from "pino";
import { triggerLearningCycle } from "../workers/continuous-learning-worker.js";

const logger = pino({ level: "info" });
const router = Router();

const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-internal-secret"];
  if (!INTERNAL_SECRET || typeof secret !== "string") {
    res.status(500).json({ error: "Internal secret not configured" });
    return;
  }
  if (secret !== INTERNAL_SECRET) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.post("/knowledge-refresh", verifyInternalSecret, async (_req: Request, res: Response) => {
  logger.info("knowledge-refresh: admin triggered manual learning cycle");
  try {
    const ok = await triggerLearningCycle();
    if (!ok) {
      return res.status(503).json({ error: "Learning cycle skipped — Nia is disabled or ANTHROPIC_API_KEY not set" });
    }
    return res.json({ success: true, message: "Learning cycle completed" });
  } catch (err) {
    logger.error({ err }, "knowledge-refresh: cycle failed");
    return res.status(500).json({ error: "Learning cycle failed" });
  }
});

export default router;
