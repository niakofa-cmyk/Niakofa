import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { getRedisConnection } from "../lib/queue";

const router: IRouter = Router();

// Build time is captured once at module load — stable within a single process
// lifetime but always reflects the actual start time of THIS deployment, not a
// hardcoded constant that never changes between releases.
const BUILD_TIME = Math.floor(Date.now() / 1000);
const VERSION =
  process.env.npm_package_version ??
  process.env.APP_VERSION ??
  "dev";

router.get("/healthz", async (_req, res) => {
  const checks: Record<string, "ok" | "error"> = {};
  let healthy = true;

  // Real DB connectivity check — a downed Postgres will surface here.
  try {
    await pool.query("SELECT 1");
    checks.db = "ok";
  } catch {
    checks.db = "error";
    healthy = false;
  }

  // Real Redis connectivity check — only included when Redis is configured.
  const redis = getRedisConnection();
  if (redis) {
    try {
      await redis.ping();
      checks.redis = "ok";
    } catch {
      checks.redis = "error";
      healthy = false;
    }
  }

  res
    .status(healthy ? 200 : 503)
    .json({ status: healthy ? "ok" : "degraded", version: VERSION, built: BUILD_TIME, checks });
});

router.get("/version", (_req, res) => {
  res.json({ version: VERSION, built: BUILD_TIME });
});

export default router;
