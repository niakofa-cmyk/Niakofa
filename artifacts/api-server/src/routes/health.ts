import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    // Verify database connectivity with a lightweight query
    await db.execute(sql`SELECT 1`);
    res.json({ status: "ok", version: "chat-v2", built: 1781660646, db: "connected" });
  } catch (err) {
    logger.error({ err }, "healthz: database connectivity check failed");
    res.status(503).json({ status: "degraded", version: "chat-v2", built: 1781660646, db: "disconnected", error: "Database unavailable" });
  }
});

router.get("/version", (_req, res) => {
  res.json({ version: "chat-v2", built: 1781660646 });
});

export default router;
