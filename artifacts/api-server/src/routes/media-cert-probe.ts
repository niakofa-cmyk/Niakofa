import { Router, type IRouter } from "express";
import { db, systemSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { verifyMediaToolchain } from "../lib/mediaCapabilities";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { runConfiguredObjectStorageProbe } from "../../scripts/verify-object-storage.mjs";

const router: IRouter = Router();
const WINDOW_MS = 30 * 60_000;
const INTERRUPTED_AFTER_MS = 2 * 60_000;
const windowEndsAt = Date.now() + WINDOW_MS;
const commit = process.env.GIT_COMMIT?.trim() ?? "";
const statusKey = `media-cert:oneoff:${commit}`;

type ProbeStatus =
  | { status: "running"; started_at: string; pending_key?: string }
  | { status: "passed"; started_at: string; completed_at: string; toolchain: "passed"; storage: { probe: string; bytes: number; deleted: true } }
  | { status: "failed"; started_at: string; completed_at: string; stage: "toolchain" | "storage"; cleanup: "verified" | "unproven" | "not_started"; manual_cleanup_key?: string };

/** A crashed process cannot attest that an in-flight remote write was deleted. */
export function publicProbeStatus(record: ProbeStatus, now = Date.now()) {
  if (record.status !== "running") return record;
  if (now - Date.parse(record.started_at) < INTERRUPTED_AFTER_MS) {
    return { status: "running" as const, started_at: record.started_at };
  }
  return {
    status: "interrupted" as const,
    started_at: record.started_at,
    cleanup: record.pending_key ? "unproven" as const : "not_started" as const,
    ...(record.pending_key ? { manual_cleanup_key: record.pending_key } : {}),
  };
}

async function saveStatus(status: ProbeStatus): Promise<void> {
  const updated = await db.update(systemSettingsTable)
    .set({ value: JSON.stringify(status), updated_at: new Date() })
    .where(eq(systemSettingsTable.key, statusKey))
    .returning({ key: systemSettingsTable.key });
  if (updated.length !== 1) throw new Error("Media probe claim disappeared");
}

router.get("/admin/media-cert/probe", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!/^[a-f0-9]{40}$/.test(commit)) return res.status(503).json({ error: "Deployment commit unavailable" });
  try {
    const [stored] = await db.select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, statusKey))
      .limit(1);
    if (!stored) return res.status(404).json({ error: "No probe recorded for this deployment" });
    return res.json(publicProbeStatus(JSON.parse(stored.value) as ProbeStatus));
  } catch {
    return res.status(503).json({ error: "Probe result unavailable" });
  }
});

router.post("/admin/media-cert/probe", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  // Requires an explicit short-lived deployment with the switch set to 1.
  // It does not enable MEDIA_PLATFORM_V21 or permit user media writes.
  if (process.env.MEDIA_CERT_PROBE_ENABLED !== "1" || Date.now() > windowEndsAt) {
    return res.status(404).json({ error: "Probe window closed" });
  }
  if (!/^[a-f0-9]{40}$/.test(commit)) return res.status(503).json({ error: "Deployment commit unavailable" });

  const started_at = new Date().toISOString();
  try {
    // The primary-key insert is atomic across replicas. It does not expire:
    // an ambiguous PUT must not become retryable when a cache TTL elapses.
    const claimed = await db.insert(systemSettingsTable)
      .values({ key: statusKey, value: JSON.stringify({ status: "running", started_at }) })
      .onConflictDoNothing()
      .returning({ key: systemSettingsTable.key });
    if (claimed.length === 0) return res.status(409).json({ error: "This deployment already attempted a probe" });
  } catch {
    return res.status(503).json({ error: "Unable to record probe attempt" });
  }

  res.status(202).json({ status: "running", result: "/api/admin/media-cert/probe" });
  void (async () => {
    let stage: "toolchain" | "storage" = "toolchain";
    let pendingKey: string | undefined;
    try {
      await verifyMediaToolchain();
      stage = "storage";
      const result = await runConfiguredObjectStorageProbe({
        expectedBucket: process.env.NODE_ENV === "production" ? "niakofa-production-media" : undefined,
        onBeforeWrite: async (key) => {
          pendingKey = key;
      // Persist BEFORE issuing the PUT, so an interrupted process has a
      // durable key that an operator can reconcile after the provider settles.
      await saveStatus({ status: "running", started_at, pending_key: key });
          logger.warn({ probeKey: key }, "media certification storage probe starting");
        },
      });
      const passed: ProbeStatus = {
        status: "passed",
        started_at,
        completed_at: new Date().toISOString(),
        toolchain: "passed",
        storage: { probe: result.probe, bytes: result.bytes, deleted: result.deleted },
      };
      await saveStatus(passed);
      logger.info("media certification toolchain and object-storage I/O passed; V21 flag unchanged");
    } catch (error) {
      const cleanupComplete = (error as { cleanupComplete?: boolean }).cleanupComplete;
      const failed: ProbeStatus = {
        status: "failed",
        started_at,
        completed_at: new Date().toISOString(),
        stage,
        cleanup: pendingKey ? (cleanupComplete === true ? "verified" : "unproven") : "not_started",
        ...(pendingKey && cleanupComplete !== true ? { manual_cleanup_key: pendingKey } : {}),
      };
      // Do not log SDK errors, binary paths, endpoints, buckets, or credentials.
      logger.error({ stage, cleanup: failed.cleanup, manualCleanupKey: failed.manual_cleanup_key }, "media certification probe failed");
      try {
        await saveStatus(failed);
      } catch {
        logger.error({ manualCleanupKey: failed.manual_cleanup_key }, "media certification result persistence failed; inspect the opaque key");
      }
    }
  })();
  return;
});

export default router;