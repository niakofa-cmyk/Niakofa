/**
 * Niakofa — Admin Analytics Routes
 *
 * Provides aggregated platform health data for the admin dashboard.
 * All routes require authentication + admin role.
 */
import { Router } from "express";
import { db, requestsTable, usersTable, reportsTable, niaMemoriesTable, niaConversationsTable, niaToggleAuditTable } from "@workspace/db";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter, authLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { broadcast } from "../lib/ws-hub";
import { getSystemSettings, setSystemSettings, getUserById } from "../lib/db-helpers";
import { cacheGet, cacheSet } from "../lib/cache";

const router = Router();

// GET /admin/analytics — comprehensive platform health snapshot
// Cached for 60s (Redis when available, in-process Map fallback).
// The dashboard polls every 60s anyway, so a cache hit saves 13 parallel DB
// queries on every poll tick without making the data feel stale.
const ANALYTICS_CACHE_KEY = "admin:analytics:v1";
const ANALYTICS_TTL_S = 60;

router.get("/admin/analytics", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  // Serve from cache if available
  const cached = await cacheGet<Record<string, unknown>>(ANALYTICS_CACHE_KEY);
  if (cached) return res.json(cached);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    statusCounts,
    categoryCounts,
    recentCompletions,
    pledgeStats,
    onlineHelpers,
    totalUsers,
    reportStatusCounts,
    reportTypeCounts,
    dailyRequests,
    trustScoreBuckets,
    newUsersWeek,
    voiceStats,
    languageDist,
  ] = await Promise.all([
    // 1. Requests by status
    db
      .select({
        status: requestsTable.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(requestsTable)
      .groupBy(requestsTable.status),

    // 2. Requests by category (all time)
    db
      .select({
        category: requestsTable.category,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(requestsTable)
      .groupBy(requestsTable.category),

    // 3. Completions in last 24h
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(requestsTable)
      .where(
        and(
          eq(requestsTable.status, "completed"),
          sql`${requestsTable.completed_at} > NOW() - INTERVAL '24 hours'`
        )
      ),

    // 4. Pledge pool health
    db
      .select({
        total_pledged: sql<number>`COALESCE(SUM(${requestsTable.pledge_amount}), 0)::int`,
        total_paid: sql<number>`COALESCE(SUM(${requestsTable.pledge_paid}), 0)::int`,
      })
      .from(requestsTable)
      .where(eq(requestsTable.payment_type, "pay_it_forward")),

    // 5. Online helpers count
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.helper_mode_active, true)),

    // 6. Total users
    db.select({ count: sql<number>`COUNT(*)::int` }).from(usersTable),

    // 7. Reports by status
    db
      .select({
        status: reportsTable.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(reportsTable)
      .groupBy(reportsTable.status),

    // 8. Reports by type
    db
      .select({
        type: reportsTable.type,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(reportsTable)
      .groupBy(reportsTable.type),

    // 9. Daily request volume — last 7 days
    db
      .select({
        day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${requestsTable.created_at}), 'Mon DD')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(requestsTable)
      .where(gte(requestsTable.created_at, sevenDaysAgo))
      .groupBy(sql`DATE_TRUNC('day', ${requestsTable.created_at})`)
      .orderBy(sql`DATE_TRUNC('day', ${requestsTable.created_at})`),

    // 10. Trust score distribution (buckets: 0-20, 20-40, 40-60, 60-80, 80-100)
    db
      .select({
        bucket: sql<string>`CASE
          WHEN ${usersTable.trust_score} IS NULL THEN 'Unknown'
          WHEN ${usersTable.trust_score} < 20 THEN '0-20'
          WHEN ${usersTable.trust_score} < 40 THEN '20-40'
          WHEN ${usersTable.trust_score} < 60 THEN '40-60'
          WHEN ${usersTable.trust_score} < 80 THEN '60-80'
          ELSE '80-100'
        END`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(usersTable)
      .groupBy(
        sql`CASE
          WHEN ${usersTable.trust_score} IS NULL THEN 'Unknown'
          WHEN ${usersTable.trust_score} < 20 THEN '0-20'
          WHEN ${usersTable.trust_score} < 40 THEN '20-40'
          WHEN ${usersTable.trust_score} < 60 THEN '40-60'
          WHEN ${usersTable.trust_score} < 80 THEN '60-80'
          ELSE '80-100'
        END`
      ),

    // 11. New users this week
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(usersTable)
      .where(gte(usersTable.created_at, sevenDaysAgo)),

    // 12. Voice activation rate (last 7 days)
    db
      .select({
        total: sql<number>`COUNT(*)::int`,
        voice: sql<number>`COUNT(*) FILTER (WHERE ${requestsTable.voice_activated} = true)::int`,
      })
      .from(requestsTable)
      .where(gte(requestsTable.created_at, sevenDaysAgo)),

    // 13. Language distribution (last 7 days, voice-activated only)
    db
      .select({
        language: sql<string>`COALESCE(${requestsTable.voice_language}, 'en')`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(requestsTable)
      .where(
        and(
          gte(requestsTable.created_at, sevenDaysAgo),
          eq(requestsTable.voice_activated, true)
        )
      )
      .groupBy(sql`COALESCE(${requestsTable.voice_language}, 'en')`)
      .orderBy(sql`COUNT(*) DESC`),
  ]);

  // Effective hourly rate: avg(pledge_paid / estimated_hours) for completed PIF
  // tasks where the helper was actually paid and hours were estimated. This is
  // the "livable wage proof" metric — surfaces what helpers actually earned per
  // hour on average, making the platform's economic promise concrete for admins.
  const [hourlyRateRow] = await db
    .select({
      avg_effective_hourly_rate: sql<number>`
        COALESCE(
          AVG(
            CASE
              WHEN ${requestsTable.estimated_hours} > 0
               AND ${requestsTable.pledge_paid} > 0
              THEN ${requestsTable.pledge_paid}::float / ${requestsTable.estimated_hours}::float
              ELSE NULL
            END
          ),
          0
        )::float`,
      sample_size: sql<number>`
        COUNT(*) FILTER (
          WHERE ${requestsTable.estimated_hours} > 0
            AND ${requestsTable.pledge_paid} > 0
        )::int`,
    })
    .from(requestsTable)
    .where(
      and(
        eq(requestsTable.status, "completed"),
        eq(requestsTable.payment_type, "pay_it_forward"),
      )
    );

  const openCount = statusCounts.find((s: { status: string; count: number }) => s.status === "open")?.count ?? 0;
  const completedCount = statusCounts.find((s: { status: string; count: number }) => s.status === "completed")?.count ?? 0;

  const payload = {
    overview: {
      total_open: openCount,
      total_completed: completedCount,
      total_helpers_online: onlineHelpers[0]?.count ?? 0,
      recent_completions_24h: recentCompletions[0]?.count ?? 0,
      total_users: totalUsers[0]?.count ?? 0,
      new_users_week: newUsersWeek[0]?.count ?? 0,
    },
    requests_by_category: categoryCounts,
    daily_request_volume: dailyRequests,
    pledge_pool: {
      total_pledged: pledgeStats[0]?.total_pledged ?? 0,
      total_paid: pledgeStats[0]?.total_paid ?? 0,
      pending: (pledgeStats[0]?.total_pledged ?? 0) - (pledgeStats[0]?.total_paid ?? 0),
    },
    // Average effective hourly rate paid to helpers (PIF tasks with estimated_hours + actual payout).
    // This is proof of the livable-wage promise — surfaces in the admin analytics dashboard.
    helper_compensation: {
      avg_effective_hourly_rate: Math.round((hourlyRateRow?.avg_effective_hourly_rate ?? 0) * 100) / 100,
      sample_size: hourlyRateRow?.sample_size ?? 0,
    },
    reports_by_status: reportStatusCounts,
    reports_by_type: reportTypeCounts,
    trust_score_distribution: trustScoreBuckets,
    voice_activation: {
      total_requests_7d: voiceStats[0]?.total ?? 0,
      voice_activated_7d: voiceStats[0]?.voice ?? 0,
      rate_pct: voiceStats[0]?.total
        ? Math.round(((voiceStats[0]?.voice ?? 0) / voiceStats[0].total) * 100)
        : 0,
    },
    language_distribution: languageDist,
  };

  // Cache for 60s so rapid dashboard polls don't hammer 13 parallel DB queries
  await cacheSet(ANALYTICS_CACHE_KEY, payload, ANALYTICS_TTL_S);
  return res.json(payload);
});

// GET /admin/accounts — list all accounts for admin review
router.get("/admin/accounts", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { approval_status, account_type } = req.query as {
    approval_status?: string;
    account_type?: string;
  };

  const conditions = [];
  if (approval_status) conditions.push(eq(usersTable.approval_status, approval_status));
  if (account_type) conditions.push(eq(usersTable.account_type, account_type));

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1), 500);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      account_type: usersTable.account_type,
      approval_status: usersTable.approval_status,
      is_helper: usersTable.is_helper,
      helper_status: usersTable.helper_status,
      is_admin: usersTable.is_admin,
      is_suspended: usersTable.is_suspended,
      suspended_at: usersTable.suspended_at,
      suspended_reason: usersTable.suspended_reason,
      organization_name: usersTable.organization_name,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(usersTable.created_at)
    .limit(limit)
    .offset(offset);

  return res.json(users);
});

// GET /admin/helper-applications — list users who have applied to be helpers
router.get("/admin/helper-applications", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { status } = req.query as { status?: string };

  const conditions = [sql`${usersTable.helper_status} IS NOT NULL`];
  if (status) conditions.push(eq(usersTable.helper_status, status));

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1), 500);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const applicants = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      helper_status: usersTable.helper_status,
      helper_skills: usersTable.helper_skills,
      helper_bio: usersTable.helper_bio,
      helper_languages: usersTable.helper_languages,
      helper_qualifications: usersTable.helper_qualifications,
      helper_vehicle: usersTable.helper_vehicle,
      identity_verified: usersTable.identity_verified,
      background_check_status: usersTable.background_check_status,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(usersTable.created_at)
    .limit(limit)
    .offset(offset);

  return res.json(applicants);
});

// POST /admin/verify-secret — verify admin secret server-side
// No Bearer token required — this is the auth step itself.
// Accepts secret via body or x-admin-secret header.
router.post("/admin/verify-secret", authLimiter, async (req, res) => {
  const secret = (req.body as { secret?: string }).secret
    ?? req.headers["x-admin-secret"] as string | undefined;
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return res.status(500).json({ error: "ADMIN_SECRET not configured" });
  if (!secret || secret !== expected) return res.status(403).json({ error: "Incorrect secret" });
  return res.json({ ok: true });
});


// POST /admin/users/:id/suspend — hard-suspend an account
router.post("/admin/users/:id/suspend", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const { reason } = req.body as { reason?: string };

  const [user] = await db
    .update(usersTable)
    .set({
      is_suspended: true,
      suspended_at: new Date(),
      suspended_reason: reason ?? "Suspended by admin",
      helper_mode_active: false,
    })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, name: usersTable.name, is_suspended: usersTable.is_suspended });

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ ok: true, user });
});

// POST /admin/users/:id/unsuspend — lift a suspension
router.post("/admin/users/:id/unsuspend", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  const [user] = await db
    .update(usersTable)
    .set({
      is_suspended: false,
      suspended_at: null,
      suspended_reason: null,
    })
    .where(eq(usersTable.id, userId))
    .returning({ id: usersTable.id, name: usersTable.name, is_suspended: usersTable.is_suspended });

  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ ok: true, user });
});

// GET /admin/suspended — list all suspended accounts
router.get("/admin/suspended", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const suspended = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      suspended_at: usersTable.suspended_at,
      suspended_reason: usersTable.suspended_reason,
      is_helper: usersTable.is_helper,
      trust_score: usersTable.trust_score,
    })
    .from(usersTable)
    .where(eq(usersTable.is_suspended, true))
    .orderBy(usersTable.suspended_at);
  return res.json(suspended);
});

// ── Nia AI toggle ─────────────────────────────────────────────────────────────
// GET /admin/nia-status — public, no auth. Frontend polls this to know
// whether to show the NiaFab and drawer.
// Returns { enabled: boolean, last_toggled_at: string | null }.
router.get("/admin/nia-status", generalApiLimiter, async (_req, res) => {
  try {
    // Single round-trip: fetch both keys together via getSystemSettings.
    const settings = await getSystemSettings(["nia_enabled", "nia_last_toggled_at"]);
    // MUST be explicitly "true" — any other value (missing, "false", empty) → disabled.
    // Previously used `!== "false"` which defaulted Nia ON when the row was absent.
    // Nia is disabled by default; admin must explicitly enable it.
    const enabled = settings["nia_enabled"] === "true";
    const last_toggled_at = settings["nia_last_toggled_at"] ?? null;
    return res.json({ enabled, last_toggled_at });
  } catch {
    // On DB error, default to DISABLED (safe fail-closed posture).
    return res.json({ enabled: false, last_toggled_at: null });
  }
});

// POST /admin/nia-toggle — admin only. Body: { enabled: boolean, reason?: string }
// Both DB writes run inside withTransaction so the WS broadcast only fires
// after a confirmed atomic commit — partial writes never trigger a broadcast
// with inconsistent state.
//
// Every toggle also writes an append-only row to nia_toggle_audit (who, when,
// why) so admins have a verifiable paper trail — see replit.md → "Legal/tax
// flags" for why this matters. The audit write is best-effort: a failure here
// must never block the actual kill-switch flip, since the toggle itself is
// the safety-critical action.
const MAX_REASON_LENGTH = 500;

router.post("/admin/nia-toggle", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { enabled, reason: rawReason } = req.body as { enabled?: boolean; reason?: string };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }
  const reason = typeof rawReason === "string" && rawReason.trim()
    ? rawReason.trim().slice(0, MAX_REASON_LENGTH)
    : null;
  const now = new Date().toISOString();
  const adminUserId = req.authenticatedUserId;

  try {
    // setSystemSettings atomically upserts all keys inside a single transaction.
    await setSystemSettings({
      nia_enabled: enabled ? "true" : "false",
      nia_last_toggled_at: now,
    });
  } catch (err) {
    logger.error({ err, enabled }, "admin: Nia AI toggle DB write failed");
    return res.status(500).json({ error: "Failed to save Nia setting — toggle not applied" });
  }

  // Best-effort audit trail write — never blocks or fails the toggle itself.
  if (adminUserId) {
    try {
      const admin = await getUserById(adminUserId);
      await db.insert(niaToggleAuditTable).values({
        enabled,
        admin_user_id: adminUserId,
        admin_email: admin?.email ?? "unknown",
        reason,
      });
    } catch (err) {
      logger.error({ err, enabled, adminUserId }, "admin: nia_toggle_audit insert failed — toggle still applied");
    }
  }

  // Broadcast only after the transaction committed successfully.
  // Kill-switch fires on all connected clients instantly, no 60s poll wait.
  broadcast({
    type: "nia_status",
    payload: { enabled, source: "admin_toggle", toggled_at: now },
  });
  logger.info({ enabled, adminUserId, reason }, "admin: Nia AI toggled — broadcast sent to all clients");
  return res.json({ ok: true, enabled, toggled_at: now });
});

// GET /admin/nia-audit-log — admin only. Returns recent kill-switch history.
// Query: ?limit=50 (default 50, max 200).
router.get("/admin/nia-audit-log", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
  try {
    const rows = await db
      .select({
        id: niaToggleAuditTable.id,
        enabled: niaToggleAuditTable.enabled,
        admin_user_id: niaToggleAuditTable.admin_user_id,
        admin_email: niaToggleAuditTable.admin_email,
        reason: niaToggleAuditTable.reason,
        created_at: niaToggleAuditTable.created_at,
      })
      .from(niaToggleAuditTable)
      .orderBy(desc(niaToggleAuditTable.created_at))
      .limit(limit);
    return res.json({ entries: rows });
  } catch (err) {
    logger.error({ err }, "admin: nia-audit-log fetch failed");
    return res.status(500).json({ error: "Failed to load audit log" });
  }
});

// ── AI Cost Monitoring ────────────────────────────────────────────────────────
// GET /admin/nia-costs — admin only. Returns daily AI cost summary from nia-service.
router.get("/admin/nia-costs", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "7"), 10) || 7, 1), 30);
  
  try {
    // Query nia-service for cost data via internal endpoint
    const niaUrl = (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const response = await fetch(`${niaUrl}/admin/costs?days=${days}`, {
      headers: {
        "x-internal-secret": process.env.INTERNAL_SECRET ?? "",
      },
    });
    
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch cost data from NIA service" });
    }
    
    const costData = await response.json();
    return res.json(costData);
  } catch (err) {
    logger.error({ err }, "admin: failed to fetch NIA cost data");
    return res.status(500).json({ error: "Failed to fetch cost data" });
  }
});

// GET /admin/nia-cost-alert — check if daily cost exceeds threshold
router.get("/admin/nia-cost-alert", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const DAILY_COST_THRESHOLD = parseFloat(process.env.NIA_DAILY_COST_THRESHOLD ?? "50.00");
  
  try {
    const niaUrl = (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const response = await fetch(`${niaUrl}/admin/costs?days=1`, {
      headers: {
        "x-internal-secret": process.env.INTERNAL_SECRET ?? "",
      },
    });
    
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch cost data" });
    }
    
    const costData = await response.json() as { daily?: Array<{ estimatedCostUsd?: number }> };
    const todayCost = costData.daily?.[0]?.estimatedCostUsd ?? 0;
    const isAlert = todayCost > DAILY_COST_THRESHOLD;
    
    return res.json({
      alert: isAlert,
      threshold: DAILY_COST_THRESHOLD,
      todayCost,
      message: isAlert 
        ? `Daily AI cost $${todayCost.toFixed(2)} exceeds threshold $${DAILY_COST_THRESHOLD.toFixed(2)}`
        : `Daily AI cost $${todayCost.toFixed(2)} within threshold $${DAILY_COST_THRESHOLD.toFixed(2)}`,
    });
  } catch (err) {
    logger.error({ err }, "admin: failed to check cost alert");
    return res.status(500).json({ error: "Failed to check cost alert" });
  }
});

// GET /admin/stats — flat KPI summary for the Analytics tab's top cards.
// BUG-CRIT-03: the frontend has called this since the Analytics tab was
// built (with a hardcoded "/api/admin/stats endpoint not responding"
// fallback message that's been silently showing for every admin, every
// time) but the route never existed server-side. See CLAUDE.md Incident #19.
router.get("/admin/stats", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const [
    requestCounts,
    userCounts,
    reportCounts,
    niaConvCount,
    trustAvg,
  ] = await Promise.all([
    db.select({
      total: sql<number>`COUNT(*)::int`,
      completed: sql<number>`COUNT(*) FILTER (WHERE ${requestsTable.status} = 'completed')::int`,
    }).from(requestsTable),
    db.select({
      total: sql<number>`COUNT(*)::int`,
      activeHelpers: sql<number>`COUNT(*) FILTER (WHERE ${usersTable.helper_mode_active} = true)::int`,
    }).from(usersTable),
    db.select({
      total: sql<number>`COUNT(*)::int`,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${reportsTable.status} = 'pending')::int`,
    }).from(reportsTable),
    db.select({ count: sql<number>`COUNT(*)::int` }).from(niaConversationsTable),
    db.select({ avg: sql<number>`COALESCE(AVG(${usersTable.trust_score}), 0)::float` }).from(usersTable),
  ]);

  return res.json({
    total_requests: requestCounts[0]?.total ?? 0,
    completed_requests: requestCounts[0]?.completed ?? 0,
    total_users: userCounts[0]?.total ?? 0,
    active_helpers: userCounts[0]?.activeHelpers ?? 0,
    total_reports: reportCounts[0]?.total ?? 0,
    pending_reports: reportCounts[0]?.pending ?? 0,
    nia_conversations: niaConvCount[0]?.count ?? 0,
    avg_trust_score: trustAvg[0]?.avg ?? 0,
  });
});

// GET /admin/nia-memory-stats — how many users have a stored Nia memory and
// how many memory rows exist total. Same prior gap as /admin/stats above.
router.get("/admin/nia-memory-stats", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const [row] = await db.select({
    users: sql<number>`COUNT(DISTINCT ${niaMemoriesTable.user_id})::int`,
    entries: sql<number>`COUNT(*)::int`,
  }).from(niaMemoriesTable);
  return res.json({ users: row?.users ?? 0, entries: row?.entries ?? 0 });
});

// PATCH /admin/accounts/:id/approval — approve or deny a pending account.
// ALL new registrations (individual, organization, business, sponsor, Google
// OAuth) start as approval_status='pending'. This endpoint is how admins
// advance or reverse that status. The Admin → Users tab lists pending
// accounts in PendingAccountsCard and the PATCH here moves them to
// 'approved' (unblocks app access) or 'denied' (keeps them blocked).
router.patch("/admin/accounts/:id/approval", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = parseInt(req.params.id as string);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });
  const { status } = req.body as { status?: "approved" | "denied" | "pending" };
  if (!status || !["approved", "denied", "pending"].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved', 'denied', or 'pending'" });
  }

  const adminUserId = req.authenticatedUserId;
  const [updated] = await db.update(usersTable)
    .set({
      approval_status: status,
      approval_reviewed_by: adminUserId ?? null,
      approval_reviewed_at: new Date(),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  if (!updated) return res.status(404).json({ error: "User not found" });

  // Notify the user by email the moment an admin approves or denies their
  // account, so they know immediately whether they can log in — without
  // needing to keep polling the pending-approval screen. Non-blocking:
  // email failures must never break the admin approval action itself.
  if (status === "approved" || status === "denied") {
    import("../lib/mailer.js").then(({ sendAlertEmail }) => {
      if (status === "approved") {
        sendAlertEmail({
          to: updated.email,
          subject: `You're approved, ${updated.name}! Welcome to Niakofa 🎉`,
          title: "Your account has been approved",
          body: `Hi ${updated.name},\n\nGreat news — your Niakofa account has been reviewed and approved. You can log in right now and start requesting help or offering it to your neighbors.`,
          ctaText: "Log In to Niakofa",
          ctaUrl: process.env["APP_URL"] ?? "https://niakofa.app",
        }).catch(err => logger.error({ err, userId }, "approval email failed"));
      } else {
        sendAlertEmail({
          to: updated.email,
          subject: `Update on your Niakofa account application`,
          title: "Your account was not approved",
          body: `Hi ${updated.name},\n\nAfter review, we were unable to approve your Niakofa account at this time. If you believe this was a mistake or would like to learn more, please reply to this email or contact support@niakofa.app.`,
        }).catch(err => logger.error({ err, userId }, "denial email failed"));
      }
    }).catch(err => logger.error({ err, userId }, "mailer import failed for approval decision email"));

    // WS push so the user's app updates instantly if they still have a tab open
    broadcast({
      type: "account_approval_decided",
      payload: { user_id: updated.id, status },
    });
  }

  const { _password_hash, ...safe } = updated;
  return res.json(safe);
});

// POST /admin/bootstrap — one-time, self-locking way to create the very
// first admin account without needing direct database/psql access.
//
// BUG-CRIT-04: requireAdmin()'s own code comment said "Set is_admin = true
// on any user row to grant admin access" — but that always meant doing it
// by hand via psql against the production database. Nothing in the app
// itself, ever, set is_admin=true for anyone. If that manual step was never
// run, no user has admin rights at all, regardless of knowing the
// VITE_ADMIN_SECRET UI gate — every real admin API call 403s for everyone.
// This endpoint exists so the very first admin can be created through the
// app/terminal instead of requiring raw SQL access.
//
// Self-locking by design: refuses to do anything once ANY user already has
// is_admin=true, so it cannot be used to create a second admin or be
// exploited if ADMIN_BOOTSTRAP_SECRET ever leaks later. Requires an env var
// that must be deliberately set (same pattern as INTERNAL_SECRET) — if it's
// never configured, this route always 503s.
//
// authLimiter applied — this is an unauthenticated secret-guessing surface,
// same threat model as /admin/verify-secret (which already got authLimiter
// in Incident #20), but this route had been missed.
router.post("/admin/bootstrap", authLimiter, async (req, res) => {
  const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!expected) {
    return res.status(503).json({ error: "Admin bootstrap is not configured. Set ADMIN_BOOTSTRAP_SECRET in Railway → api-server → Variables." });
  }
  const { email, secret } = req.body as { email?: string; secret?: string };
  if (secret !== expected) {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  const [{ adminCount }] = await db.select({ adminCount: sql<number>`COUNT(*)::int` })
    .from(usersTable).where(eq(usersTable.is_admin, true));
  if (adminCount > 0) {
    return res.status(403).json({ error: "An admin account already exists — this endpoint only works once." });
  }

  const [updated] = await db.update(usersTable)
    .set({ is_admin: true })
    .where(eq(usersTable.email, email.trim().toLowerCase()))
    .returning();
  if (!updated) {
    return res.status(404).json({ error: "No account found with that email — register normally first, then run this." });
  }

  logger.info({ userId: updated.id, email: updated.email }, "admin: bootstrap created first admin account");
  return res.json({ ok: true, user_id: updated.id, email: updated.email });
});

// ── Community Pool Settings ────────────────────────────────────────────────
// GET /admin/pool-settings — read current pool config (enabled flag + wage floors).
// PATCH /admin/pool-settings — update one or more settings atomically.
//
// These three keys drive every payout the pool makes. Putting them behind
// requireAdmin() means the app can change live values without a redeploy.

router.get("/admin/pool-settings", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  try {
    const map = await getSystemSettings([
      "pool_enabled",
      "pool_minimum_hourly_rate",
      "pool_guaranteed_minimum",
    ]);
    return res.json({
      pool_enabled: map["pool_enabled"] !== "false",
      pool_minimum_hourly_rate: parseFloat(map["pool_minimum_hourly_rate"] ?? "15") || 15,
      pool_guaranteed_minimum: parseFloat(map["pool_guaranteed_minimum"] ?? "20") || 20,
    });
  } catch (err) {
    logger.error({ err }, "admin: failed to read pool settings");
    return res.status(500).json({ error: "Failed to load pool settings" });
  }
});

router.patch("/admin/pool-settings", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const body = req.body as {
    pool_enabled?: boolean;
    pool_minimum_hourly_rate?: number;
    pool_guaranteed_minimum?: number;
  };

  const updates: Array<{ key: string; value: string }> = [];

  if (typeof body.pool_enabled === "boolean") {
    updates.push({ key: "pool_enabled", value: body.pool_enabled ? "true" : "false" });
  }
  if (typeof body.pool_minimum_hourly_rate === "number") {
    if (!Number.isFinite(body.pool_minimum_hourly_rate) || body.pool_minimum_hourly_rate <= 0 || body.pool_minimum_hourly_rate > 999) {
      return res.status(400).json({ error: "pool_minimum_hourly_rate must be a positive number ≤ 999" });
    }
    updates.push({ key: "pool_minimum_hourly_rate", value: String(body.pool_minimum_hourly_rate) });
  }
  if (typeof body.pool_guaranteed_minimum === "number") {
    if (!Number.isFinite(body.pool_guaranteed_minimum) || body.pool_guaranteed_minimum < 0 || body.pool_guaranteed_minimum > 9999) {
      return res.status(400).json({ error: "pool_guaranteed_minimum must be ≥ 0 and ≤ 9999" });
    }
    updates.push({ key: "pool_guaranteed_minimum", value: String(body.pool_guaranteed_minimum) });
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "No valid fields provided. Send at least one of: pool_enabled, pool_minimum_hourly_rate, pool_guaranteed_minimum" });
  }

  // Use setSystemSettings for a single atomic transaction: if either the
  // pool_enabled flag or a wage floor fails to write, neither is committed.
  const settingsObj: Record<string, string> = {};
  for (const { key, value } of updates) settingsObj[key] = value;
  await setSystemSettings(settingsObj);

  logger.info({ updates, admin: req.authenticatedUserId }, "admin: pool settings updated");
  return res.json({ ok: true, updated: updates.map((u) => u.key) });
});

// ── GET /admin/pending-summary ────────────────────────────────────────────────
// Real-time counts of items requiring admin action. Polled by AdminLiveBanner
// every 30 s (and pushed over WS on change) so admins always know what needs
// attention without manually navigating each tab.
router.get("/admin/pending-summary", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const [accts, helpers, hardships, reports] = await Promise.all([
    // Non-individual accounts awaiting approval (business, sponsor, organization)
    db.select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(
        eq(usersTable.approval_status, "pending"),
        sql`${usersTable.account_type} != 'individual'`,
      )),
    // Helper applications pending review
    db.select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.helper_status, "pending")),
    // Hardship waiver requests — use raw SQL so this gracefully returns 0 if
    // the column doesn't exist yet (avoids crashing the whole summary).
    db.execute(sql`
      SELECT COUNT(*)::int AS count FROM users
      WHERE hardship_requested_at IS NOT NULL
        AND (hardship_dismissed_at IS NULL)
    `).catch(() => ({ rows: [{ count: 0 }] })),
    // Unreviewed community reports (placeholder — returns 0 if table absent)
    db.execute(sql`SELECT 0::int AS count`).catch(() => ({ rows: [{ count: 0 }] })),
  ]);

  const pending_accounts = accts[0]?.count ?? 0;
  const pending_helper_apps = helpers[0]?.count ?? 0;
  // drizzle.execute returns { rows: [...] } shape
  const pending_hardships = Number((hardships as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0);
  const pending_reports_count = Number((reports as unknown as { rows: { count: number }[] }).rows?.[0]?.count ?? 0);
  const total_action_items = pending_accounts + pending_helper_apps + pending_hardships + pending_reports_count;

  return res.json({
    pending_accounts,
    pending_helper_apps,
    pending_hardships,
    pending_reports: pending_reports_count,
    total_action_items,
    refreshed_at: new Date().toISOString(),
  });
});

export default router;
