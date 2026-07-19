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
function getRegion(lat: number, lng: number): string {
  // 1. Caribbean (before North America — overlapping longitude band)
  if (lat >= 10 && lat <= 26  && lng >= -86  && lng <= -58) return "Caribbean";
  // 2. Europe (before Africa — southern Europe overlaps Africa's lat range)
  if (lat >= 37 && lat <= 72  && lng >= -10  && lng <= 40)  return "Europe";
  // 3. Middle East (before Africa — Arabia/Levant/Iran overlap Africa box)
  //    lng starts at 34 so Egypt/Sudan (lng ~31–33) stays in Africa
  if (lat >= 12 && lat <= 42  && lng >= 34   && lng <= 65)  return "Middle East";
  // 4. Africa (now only truly African points remain)
  if (lat >= -35 && lat <= 38 && lng >= -18  && lng <= 52)  return "Africa";
  // 5. North America
  if (lat >= 7  && lat <= 72  && lng >= -168 && lng <= -52) return "North America";
  // 6. South America
  if (lat >= -56 && lat <= 12 && lng >= -82  && lng <= -34) return "South America";
  // 7. Asia
  if (lat >= -10 && lat <= 55 && lng >= 60   && lng <= 145) return "Asia";
  // 8. Oceania
  if (lat >= -50 && lat <= -10 && lng >= 110 && lng <= 180) return "Oceania";
  return "Other";
}

const REGION_ORDER = [
  "Africa", "North America", "Europe", "Caribbean",
  "South America", "Middle East", "Asia", "Oceania", "Other",
];

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
    const navCb = getNavigationCircuitBreakerStatus();
    res.json({
      status: navCb.state === "open" ? "degraded" : "ok",
      version: "chat-v2",
      commit: GIT_COMMIT,
      started_at: PROCESS_STARTED_AT,
      db: "connected",
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
      error: "Database unavailable",
      mapbox_circuit_breaker: navCb,
    });
  }
});

router.get("/version", (_req, res) => {
  res.json({ version: "chat-v2", commit: GIT_COMMIT, started_at: PROCESS_STARTED_AT });
});

// ── Worker health — admin-only ────────────────────────────────────────────────
// Returns the status of every registered background worker so the admin panel
// can surface a banner if Redis drops and critical workers stop running.
router.get("/admin/worker-health", requireAuth, adminLimiter, async (req, res, next) => {
  try {
    await requireAdmin()(req, res, async () => {
      const workers = getWorkerHealth();
      const critical = areAllCriticalWorkersRunning();
      const redisOk = isRedisConfigured();
      const redisUrlStatus = getRedisUrlStatus();
      // Hub metrics are O(n) in-memory reads — no DB call, no async needed.
      const hub = getHubMetrics();
      res.json({
        status: critical && redisOk ? "ok" : "degraded",
        redis_configured: redisOk,
        redis_url_status: redisUrlStatus,
        process_started_at: PROCESS_STARTED_AT,
        workers,
        websocket_hub: hub,
      });
    });
  } catch (err) {
    next(err);
  }
});

// ── Global Ops snapshot — admin-only ─────────────────────────────────────────
// One-stop dashboard feed: GPS health, regional coverage, language distribution,
// and live feature-flag verification. Auto-polled every 60s by the admin panel.
router.get("/admin/global-ops", requireAuth, adminLimiter, async (req, res, next) => {
  try {
    await requireAdmin()(req, res, async () => {
      // Run all DB queries in parallel to keep latency low
      const [onlineHelperRows, openRequestRows, completedRows, langRows] = await Promise.all([
        db.execute(sql`SELECT lat, lng FROM users WHERE helper_status = 'online'`),
        db.execute(sql`SELECT lat, lng FROM help_requests WHERE status = 'open'`),
        db.execute(sql`
          SELECT lat, lng FROM help_requests
          WHERE status = 'completed'
            AND completed_at > NOW() - INTERVAL '7 days'
        `),
        db.execute(sql`
          SELECT COALESCE(voice_language, 'en') AS lang, COUNT(*)::int AS count
          FROM help_requests
          WHERE created_at > NOW() - INTERVAL '7 days'
          GROUP BY voice_language
          ORDER BY count DESC
          LIMIT 10
        `),
      ]);

      type Row = { lat: number | null; lng: number | null };
      type LangRow = { lang: string; count: number };

      // GPS health — helpers online WITH vs WITHOUT coordinates
      const helpersWithGps  = (onlineHelperRows.rows as Row[]).filter(h => h.lat != null && h.lng != null);
      const helpersNoGps    = onlineHelperRows.rows.length - helpersWithGps.length;

      // Region buckets
      const helperRegions:    Record<string, number> = {};
      const requestRegions:   Record<string, number> = {};
      const completedRegions: Record<string, number> = {};

      for (const h of helpersWithGps) {
        const r = getRegion(h.lat!, h.lng!);
        helperRegions[r] = (helperRegions[r] ?? 0) + 1;
      }
      for (const r of (openRequestRows.rows as Row[])) {
        if (r.lat == null || r.lng == null) continue;
        const reg = getRegion(r.lat, r.lng);
        requestRegions[reg] = (requestRegions[reg] ?? 0) + 1;
      }
      for (const r of (completedRows.rows as Row[])) {
        if (r.lat == null || r.lng == null) continue;
        const reg = getRegion(r.lat, r.lng);
        completedRegions[reg] = (completedRegions[reg] ?? 0) + 1;
      }

      const activeSet = new Set([
        ...Object.keys(helperRegions),
        ...Object.keys(requestRegions),
        ...Object.keys(completedRegions),
      ]);
      const regions = REGION_ORDER
        .filter(r => activeSet.has(r))
        .map(r => ({
          region:              r,
          helpers_online:      helperRegions[r]    ?? 0,
          open_requests:       requestRegions[r]   ?? 0,
          recent_completions:  completedRegions[r] ?? 0,
        }));

      // Language distribution (last 7 days of requests)
      const language_distribution = (langRows.rows as LangRow[]).map(row => ({
        lang:  row.lang ?? "en",
        count: Number(row.count),
      }));

      // Feature-flag verification — no calls to external APIs; just env presence
      const workers    = getWorkerHealth();
      const workersOk  = workers.every(w => w.status === "running" || w.status === "stopped");

      // Mapbox: accept MAPBOX_TOKEN (server preferred) OR VITE_MAPBOX_TOKEN (client/legacy).
      // Use || (not ??) so empty-string placeholders fall through correctly.
      const mapboxConfigured = !!(process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN);
      // Nia AI: Anthropic is the primary engine; check both key names
      const niaConfigured = !!(process.env.ANTHROPIC_API_KEY ?? process.env.NIA_API_KEY);
      // Push notifications
      const pushConfigured = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
      // Internal service security
      const internalSecretSet = !!(process.env.INTERNAL_SECRET);
      // Stripe payments
      const stripeConfigured = !!(process.env.STRIPE_SECRET_KEY);
      // Background checks
      const checkrConfigured = !!(process.env.CHECKR_API_KEY);
      // Nia service URL (defaults to localhost:3001 in dev)
      const niaServiceUrl = process.env.NIA_SERVICE_URL ?? "http://localhost:3001 (dev default)";

      // Count configured vs missing critical secrets
      const criticalSecrets = [
        { key: "MAPBOX_TOKEN / VITE_MAPBOX_TOKEN", ok: mapboxConfigured },
        { key: "ANTHROPIC_API_KEY",                ok: niaConfigured },
        { key: "INTERNAL_SECRET",                  ok: internalSecretSet },
      ];
      const redisUrlStatus = getRedisUrlStatus();
      const optionalSecrets = [
        { key: "VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY", ok: pushConfigured },
        { key: "STRIPE_SECRET_KEY",                    ok: stripeConfigured },
        { key: "CHECKR_API_KEY",                       ok: checkrConfigured },
        {
          key: redisUrlStatus === "invalid_format" ? "REDIS_URL (set but INVALID FORMAT)" : "REDIS_URL",
          ok: isRedisConfigured(),
        },
      ];
      const missingCritical = criticalSecrets.filter(s => !s.ok).map(s => s.key);
      const missingOptional = optionalSecrets.filter(s => !s.ok).map(s => s.key);

      res.json({
        gps_health: {
          helpers_online_with_gps: helpersWithGps.length,
          helpers_online_no_gps:   helpersNoGps,
          total_online_helpers:    onlineHelperRows.rows.length,
        },
        regions,
        language_distribution,
        feature_checks: {
          database:         "ok",
          mapbox_token:     mapboxConfigured,
          nia_ai:           niaConfigured,
          internal_secret:  internalSecretSet,
          redis:            isRedisConfigured(),
          redis_url_status: redisUrlStatus,
          push_vapid:       pushConfigured,
          stripe:           stripeConfigured,
          background_checks: checkrConfigured,
          workers_ok:       workersOk,
        },
        // Actionable config status for admin — tells exactly what needs to be set
        config_status: {
          critical_missing: missingCritical,
          optional_missing:  missingOptional,
          fully_configured:  missingCritical.length === 0,
          nia_service_url:  niaServiceUrl,
          notes: missingCritical.length > 0
            ? `⚠️ ${missingCritical.length} critical secret(s) missing — map, navigation, and/or Nia AI will not function until configured in Replit Secrets.`
            : optionalSecrets.filter(s => !s.ok).length > 0
            ? `✅ Core features ready. Optional: ${missingOptional.join(", ")} not configured.`
            : "✅ All features fully configured.",
        },
        summary: {
          total_open_requests:   openRequestRows.rows.length,
          total_online_helpers:  onlineHelperRows.rows.length,
          regions_active:        regions.filter(r => r.helpers_online > 0 || r.open_requests > 0).length,
          last_updated:          new Date().toISOString(),
        },
      });
    });
  } catch (err) {
    next(err);
  }
});

// ── Public status page feed — no auth required ────────────────────────────────
// Returns the minimum information needed to show a "Is Niakofa working?" page
// to users who can't load the app (wrong region, server degraded, etc.).
//
// Deliberately exposes NO sensitive data beyond health signals:
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
  let niaEnabled = false;
  try {
    const val = await getSystemSetting("nia_enabled");
    // fail-closed: only an explicit "true" counts as enabled, matching every other Nia gate
    niaEnabled = dbOk && val === "true";
  } catch { /* fall through */ }
  checks.push({ name: "nia_ai", ok: niaEnabled });

  // 3. Map / Geolocation — check env key presence (no external call)
  const mapOk = !!(process.env.MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN);
  checks.push({ name: "map", ok: mapOk });

  const allOk = checks.every(c => c.ok);
  // NOTE: commit and started_at are intentionally omitted here. They are
  // served by /healthz (Railway probe) and /version (ops tooling) which are
  // also unauthenticated but exist for internal use, not public consumption.
  res.status(allOk ? 200 : 503).json({
    status: allOk ? "operational" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  });
});

export default router;
