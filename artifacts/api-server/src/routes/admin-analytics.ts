/**
 * Niakofa — Admin Analytics Routes
 *
 * Provides aggregated platform health data for the admin dashboard.
 * All routes require authentication + admin role.
 */
import { Router } from "express";
import { db, requestsTable, usersTable, reportsTable, systemSettingsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// GET /admin/analytics — comprehensive platform health snapshot
router.get("/admin/analytics", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
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

  const openCount = statusCounts.find((s: { status: string; count: number }) => s.status === "open")?.count ?? 0;
  const completedCount = statusCounts.find((s: { status: string; count: number }) => s.status === "completed")?.count ?? 0;

  return res.json({
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
  });
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
router.post("/admin/verify-secret", async (req, res) => {
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
// DB-backed flag — reads from system_settings table so the toggle survives
// Railway redeploys. Falls back to enabled if no row exists (safe default).
async function getNiaEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    return row?.value !== "false";
  } catch {
    return true; // safe default
  }
}

async function setNiaEnabled(enabled: boolean): Promise<void> {
  const value = enabled ? "true" : "false";
  await db
    .insert(systemSettingsTable)
    .values({ key: "nia_enabled", value })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: { value, updated_at: new Date() },
    });
}

// GET /admin/nia-status — public, no auth. Frontend polls this to know
// whether to show the NiaFab and drawer. Returns { enabled: boolean }.
router.get("/admin/nia-status", async (_req, res) => {
  const enabled = await getNiaEnabled();
  return res.json({ enabled });
});

// POST /admin/nia-toggle — admin only. Body: { enabled: boolean }
router.post("/admin/nia-toggle", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }
  await setNiaEnabled(enabled);
  logger.info({ enabled }, "admin: Nia AI toggled");
  return res.json({ ok: true, enabled });
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
    
    const costData = await response.json();
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

export default router;
