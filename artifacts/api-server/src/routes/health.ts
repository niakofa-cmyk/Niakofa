import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// "built" and "commit" used to be hardcoded literals that never changed —
// healthz could report success while running deploys old by days, with no
// way to tell from the response itself. RAILWAY_GIT_COMMIT_SHA is injected
// automatically by Railway at build time (no config needed); PROCESS_STARTED_AT
// is captured once at module load, so it changes on every real deploy/restart
// even if the commit SHA lookup ever failed for some reason.
const GIT_COMMIT = (process.env.RAILWAY_GIT_COMMIT_SHA ?? "unknown").slice(0, 7);
const PROCESS_STARTED_AT = new Date().toISOString();

router.get("/healthz", async (_req, res) => {
  try {
    // Verify database connectivity with a lightweight query
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", version: "chat-v2", commit: GIT_COMMIT, started_at: PROCESS_STARTED_AT, db: "connected" });
  } catch (err) {
    logger.error({ err }, "healthz: database connectivity check failed");
    res.status(503).json({ status: "degraded", version: "chat-v2", commit: GIT_COMMIT, started_at: PROCESS_STARTED_AT, db: "disconnected", error: "Database unavailable" });
  }
});

router.get("/version", (_req, res) => {
  res.json({ version: "chat-v2", commit: GIT_COMMIT, started_at: PROCESS_STARTED_AT });
});

export default router;
