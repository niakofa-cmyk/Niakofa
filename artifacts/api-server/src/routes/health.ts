import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getWorkerHealth, areAllCriticalWorkersRunning } from "../lib/worker-registry";
import { isRedisConfigured, getRedisUrlStatus } from "../lib/queue";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { getHubMetrics } from "../lib/ws-hub";
import { getSystemSetting } from "../lib/db-helpers";
import { getNavigationCircuitBreakerStatus } from "./navigation";
import { getStorageDescription } from "../lib/storage";
import { isValidLiveKitUrl } from "../lib/circleMediaConfig";

// ── Region bucketing ──────────────────────────────────────────────────────────
// Maps a lat/lng point to one of the platform's target regions.
//
// EVALUATION ORDER MATTERS — these boxes overlap and must be checked from most
// specific / northerly to most general to avoid mis-classification:
//
//  1. Caribbean   — checked before N. America (same longitude band)
//  2. Europe      — lat 37–72, lng -10–40; MUST come before Africa whose box
//                   extends to lat 38, overlapping southern Europe
//  3. Middle East — lat 12–42, lng 34–65; MUST come before Africa which also
//                   covers these coordinates (e.g. Egypt / Horn of Africa top)
//  4. Africa      — after Europe & Middle East so only truly African points land here
//  5–8. Rest of world in decreasing likelihood for our user base
//
// Verified boundary city samples:
//   Athens GR (37.9N, 23.7E)  → Europe  ✓
//   Riyadh SA (24.7N, 46.7E)  → Middle East ✓
//   Cairo EG  (30.0N, 31.2E)  → Africa (lng 31.2 < 34, misses ME box) ✓
//   Nairobi KE (-1.3S, 36.8E) → Africa (lat -1 < 12, misses ME box) ✓
//   Lagos NG   (6.5N,  3.4E)  → Africa ✓
//   Kingston JM (18.0N,-76.8W) → Caribbean ✓
//   NYC US     (40.7N,-74.0W) → North America ✓
//   São Paulo BR (-23.5S,-46.6W) → South America ✓
//   Sydney AU  (-33.9S,151.2E) → Pacific ✓
const REGIONS: Array<{
  name: string;
  minLat: number; maxLat: number;
  minLng: number; maxLng: number;
}> = [
  // Caribbean — narrow lat/lng window; must come before North America
  { name: "Caribbean",     minLat:  10, maxLat:  25, minLng: -85, maxLng: -60 },
  // Europe — must come before Africa (lat boxes overlap around 37–38N)
  { name: "Europe",        minLat:  37, maxLat:  72, minLng: -10, maxLng:  40 },
  // Middle East — must come before Africa (lat/lng boxes overlap at Horn of Africa)
  { name: "Middle East",   minLat:  12, maxLat:  42, minLng:  34, maxLng:  65 },
  // Africa — checked after Europe & Middle East
  { name: "Africa",        minLat: -35, maxLat:  38, minLng: -20, maxLng:  52 },
  { name: "North America", minLat:  15, maxLat:  85, minLng:-168, maxLng: -50 },
  { name: "South America", minLat: -56, maxLat:  15, minLng: -82, maxLng: -33 },
  { name: "Asia",          minLat: -10, maxLat:  55, minLng:  65, maxLng: 150 },
  { name: "Pacific",       minLat: -50, maxLat:  25, minLng: 130, maxLng: 180 },
];

function bucketRegion(lat: number, lng: number): string {
  for (const r of REGIONS) {
    if (lat >= r.minLat && lat <= r.maxLat && lng >= r.minLng && lng <= r.maxLng) {
      return r.name;
    }
  }
  return "Other";
}

// ── Module-level constants ────────────────────────────────────────────────────
const PROCESS_STARTED_AT = new Date().toISOString();
const GIT_COMMIT = process.env["GIT_COMMIT"] ?? "unknown";
const NIA_HEALTH_TIMEOUT_MS = 2_000;

const router: IRouter = Router();

function getLiveKitReadiness(): {
  status: "ready" | "degraded";
  detail: string;
} {
  const livekitUrl = process.env.LIVEKIT_URL;
  const configured =
    Boolean(process.env.LIVEKIT_API_KEY) &&
    Boolean(process.env.LIVEKIT_API_SECRET) &&
    Boolean(livekitUrl) &&
    isValidLiveKitUrl(livekitUrl ?? "", {
      allowLocalWs: process.env.NODE_ENV !== "production",
    });

  return configured
    ? { status: "ready", detail: "configured" }
    : {
        status: "degraded",
        detail: "LIVEKIT_URL and server credentials are incomplete or invalid",
      };
}

async function checkNiaService(): Promise<{ status: "ok" | "unavailable"; httpStatus?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NIA_HEALTH_TIMEOUT_MS);

  try {
    const niaUrl = (process.env["NIA_SERVICE_URL"] ?? "http://localhost:3001").replace(/\/$/, "");
    const response = await fetch(`${niaUrl}/health`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    return response.ok
      ? { status: "ok", httpStatus: response.status }
      : { status: "unavailable", httpStatus: response.status };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

// ── GET /healthz — Railway deploy probe ──────────────────────────────────────
// Railway calls this to decide whether the container is ready for traffic.
// Returns HTTP 200 when the DB is reachable; HTTP 503 when it's not.
// NO feature-flag checks here — missing env vars are not a reason to refuse traffic.
router.get("/healthz", async (_req, res) => {
  try {
    // Verify database connectivity with a lightweight query
    await db.execute(sql`SELECT 1`);
    const navCb = getNavigationCircuitBreakerStatus();
    res.json({
      status: navCb.state === "open" ? "degraded" : "ok",
      version: "chat-v2",
      commit: GIT_COMMIT,
      started_at: PROCESS_STARTED_AT,
      db: "connected",
      storage: getStorageDescription(),
      mapbox_circuit_breaker: navCb,
    });
  } catch (err) {
    logger.error({ err }, "healthz: database connectivity check failed");
    const navCb = getNavigationCircuitBreakerStatus();
    res.status(503).json({
      status: "degraded",
      version: "chat-v2",
      commit: GIT_COMMIT,
      started_at: PROCESS_STARTED_AT,
      db: "disconnected",
      storage: getStorageDescription(),
      error: "Database unavailable",
      mapbox_circuit_breaker: navCb,
    });
  }
});

// ── GET /health — compatibility probe for external deploy monitors ────────────
// The Nia service has historically exposed /health, while the public API's
// canonical Railway probe is /healthz. Keep this endpoint bounded so a missing
// or crashed co-located Nia process cannot leave external monitors hanging.
router.get("/health", async (_req, res) => {
  const nia = await checkNiaService();
  res.status(nia.status === "ok" ? 200 : 503).json({
    status: nia.status === "ok" ? "ok" : "degraded",
    service: "api-server",
    nia_service: nia,
    commit: GIT_COMMIT,
    started_at: PROCESS_STARTED_AT,
  });
});

// ── GET /readiness — machine-readable dependency readiness ────────────────────
// /healthz answers whether Railway can send traffic to the API. This endpoint
// gives operators and clients the complete bounded dependency picture without
// making optional services a deployment gate.
router.get("/readiness", async (_req, res) => {
  const dbStart = Date.now();
  let database: "ready" | "unavailable" = "unavailable";
  let schema: "ready" | "unavailable" = "unavailable";
  try {
    await db.execute(sql`SELECT 1`);
    const schemaCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'help_requests'
      ) AS exists
    `);
    const tableExists = Boolean((schemaCheck as { rows?: Array<{ exists?: boolean }> }).rows?.[0]?.exists);
    schema = tableExists ? "ready" : "unavailable";
    database = tableExists ? "ready" : "unavailable";
    if (!tableExists) {
      logger.warn("readiness: public.help_requests is not migrated; database workers remain paused");
    }
  } catch (err) {
    logger.warn({ err }, "readiness: database unavailable");
  }

  const nia = await checkNiaService();
  const redisConfigured = isRedisConfigured();
  const mapConfigured = Boolean(process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const livekit = getLiveKitReadiness();
  const dependencies = {
    database: {
      required: true,
      status: database,
      detail: database === "ready" ? "connected and migrated" : "connection or schema unavailable",
    },
    schema: {
      required: true,
      status: schema,
      detail: schema === "ready"
        ? "public.help_requests is available"
        : "public.help_requests has not been migrated",
    },
    nia: {
      required: false,
      status: nia.status === "ok" ? "ready" : "degraded",
      detail: nia.status === "ok" ? "available" : "unavailable",
    },
    redis: {
      required: false,
      status: redisConfigured ? "ready" : "degraded",
      detail: redisConfigured ? "queue-backed" : "durable scheduler fallback",
    },
    stripe: {
      required: false,
      status: stripeConfigured ? "ready" : "degraded",
      detail: stripeConfigured ? "configured" : "payments remain pending",
    },
    mapbox: {
      required: false,
      status: mapConfigured ? "ready" : "degraded",
      detail: mapConfigured ? "configured" : "map/address fallback",
    },
    livekit: {
      required: false,
      status: livekit.status,
      detail: livekit.detail,
    },
  } as const;
  const ready = database === "ready" && schema === "ready";
  const degraded = Object.values(dependencies).some((dependency) => dependency.status === "degraded");

  res.status(ready ? 200 : 503).json({
    status: ready ? (degraded ? "degraded" : "ready") : "unready",
    ready,
    required: { database: ready },
    dependencies,
    database_latency_ms: Date.now() - dbStart,
    commit: GIT_COMMIT,
    started_at: PROCESS_STARTED_AT,
  });
});

// ── GET /version — build metadata for ops tooling ────────────────────────────
router.get("/version", (_req, res) => {
  res.json({
    version: "chat-v2",
    commit: GIT_COMMIT,
    started_at: PROCESS_STARTED_AT,
    node: process.version,
  });
});

// ── GET /admin/worker-health — worker registry ────────────────────────────────
router.get("/admin/worker-health", requireAuth, adminLimiter, async (req, res, next) => {
  try {
    const authUser = (req as unknown as { user?: { is_admin?: boolean } }).user;
    if (!authUser?.is_admin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    const workers = getWorkerHealth();
    const allCriticalOk = areAllCriticalWorkersRunning();
    res.json({
      workers,
      all_critical_ok: allCriticalOk,
      redis: isRedisConfigured()
        ? { configured: true }
        : { configured: false, status: getRedisUrlStatus() },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /admin/global-ops — global ops dashboard ──────────────────────────────
router.get("/admin/global-ops", requireAuth, adminLimiter, async (req, res, next) => {
  try {
    const authUser = (req as unknown as { user?: { is_admin?: boolean } }).user;
    if (!authUser?.is_admin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    // 1. Worker health
    const workers = getWorkerHealth();
    const allCriticalOk = areAllCriticalWorkersRunning();

    // 2. WebSocket hub metrics
    const hubMetrics = getHubMetrics();

    // 3. Redis status
    const redisConfigured = isRedisConfigured();
    const redisStatus = redisConfigured ? "configured" : getRedisUrlStatus();

    // 4. Circuit breaker (navigation / Mapbox)
    const navCb = getNavigationCircuitBreakerStatus();

    // 5. Storage backend
    const storageDesc = getStorageDescription();

    // 6. System settings snapshot (non-secret, ops-relevant ones only)
    let settingsSnapshot: Record<string, string | null> = {};
    try {
      const settingKeys = [
        "nia_enabled",
        "businesses_enabled",
        "instant_payouts_enabled",
        "max_pool_withdrawal_pct",
        "min_pool_balance_usd",
        "tos_version",
      ];
      const values = await Promise.all(settingKeys.map(k => getSystemSetting(k)));
      settingsSnapshot = Object.fromEntries(settingKeys.map((k, i) => [k, values[i]]));
    } catch {
      settingsSnapshot = { error: "failed to read system settings" };
    }

    res.json({
      workers: {
        all_critical_ok: allCriticalOk,
        list: workers,
      },
      websocket_hub: hubMetrics,
      redis: { configured: redisConfigured, status: redisStatus },
      navigation_circuit_breaker: navCb,
      storage: storageDesc,
      system_settings: settingsSnapshot,
      process: {
        commit: GIT_COMMIT,
        started_at: PROCESS_STARTED_AT,
        node: process.version,
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /admin/region-map — map coordinates to region buckets ─────────────────
// Debug endpoint for verifying the region-bucketing logic.
router.get("/admin/region-map", requireAuth, requireAdmin, adminLimiter, async (req, res, next) => {
  try {
    const { lat, lng } = req.query as { lat?: string; lng?: string };
    if (!lat || !lng) {
      res.status(400).json({ error: "lat and lng query params required" });
      return;
    }
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      res.status(400).json({ error: "lat and lng must be numeric" });
      return;
    }
    res.json({
      lat: latNum,
      lng: lngNum,
      region: bucketRegion(latNum, lngNum),
      regions_checked: REGIONS.map(r => ({
        name: r.name,
        matched:
          latNum >= r.minLat && latNum <= r.maxLat &&
          lngNum >= r.minLng && lngNum <= r.maxLng,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/status — public status page endpoint ────────────────────────────
// Used by the frontend status page and external monitors (UptimeRobot, etc.).
//
// Design intent:
//   • always returns HTTP 200 — the response body communicates "operational"
//     vs "degraded". HTTP 503 here would kill Railway deploy healthchecks
//     whenever optional features (Nia kill-switch, Mapbox token) are not
//     configured, even though the server itself is fully functional.
//   • no commit SHA  (available at /healthz and /version for authenticated ops tools)
//   • no started_at  (available at /healthz and /version)
//   • no user counts, no secrets, no internals
//
// Every field here is either:
//   - a boolean "ok" flag, or
//   - a numeric latency (helpful for status-page UX, reveals nothing sensitive), or
//   - a short "operational" / "degraded" string, or
//   - an ISO timestamp so the caller can verify the response is fresh.
router.get("/status", async (_req, res) => {
  const checks: Array<{ name: string; ok: boolean; latency_ms?: number }> = [];

  // 1. Database
  const dbStart = Date.now();
  let dbOk = false;
  try {
    await db.execute(sql`SELECT 1`);
    dbOk = true;
  } catch { /* fall through */ }
  checks.push({ name: "database", ok: dbOk, latency_ms: Date.now() - dbStart });

  // 2. Nia AI — check kill-switch setting via db-helpers (no external API call)
  // We distinguish three states:
  //   enabled  → ok: true,  disabled: false  (Nia is live)
  //   disabled → ok: true,  disabled: true   (intentionally off — NOT a system error)
  //   error    → ok: false, disabled: false  (DB failure reading the setting)
  let niaEnabled = false;
  let niaDisabled = false; // intentionally toggled off by admin (not a failure)
  try {
    if (dbOk) {
      const val = await getSystemSetting("nia_enabled");
      if (val === "true") {
        niaEnabled = true;
      } else {
        // Any value other than "true" is intentional-off, not broken
        niaEnabled = false;
        niaDisabled = true;
      }
    }
  } catch { /* fall through — dbOk already false, niaDisabled stays false */ }
  // Mark ok=true when DB is healthy (disabled intentionally = not a system fault)
  checks.push({ name: "nia_ai", ok: dbOk ? true : false, ...(niaEnabled ? {} : { disabled: niaDisabled }) } as { name: string; ok: boolean; latency_ms?: number; disabled?: boolean });

  // 3. Map / Geolocation — check env key presence (no external call)
  const mapOk = !!(process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN);
  checks.push({ name: "map", ok: mapOk });

  const allOk = checks.every(c => c.ok);
  // NOTE: commit and started_at are intentionally omitted here. They are
  // served by /healthz (Railway probe) and /version (ops tooling) which are
  // also unauthenticated but exist for internal use, not public consumption.
  //
  // IMPORTANT: this endpoint always returns HTTP 200 regardless of check results.
  // Returning 503 here would cause Railway's healthcheck to kill the deploy
  // whenever optional features (nia_enabled flag, MAPBOX_TOKEN) are not
  // configured — even when the server itself is fully operational.
  // The response body's "status" field ("operational" / "degraded") communicates
  // feature health to the frontend status page. The deploy gate is /healthz.
  res.status(200).json({
    status: allOk ? "operational" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
