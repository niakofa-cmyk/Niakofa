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
// In-process cache of the DB value. Seeded from system_settings at boot via
// initNiaEnabled() below. Falls back to NIA_ENABLED env var if DB is
// unreachable at startup; defaults to true (enabled) if neither is set.
// A write via POST /admin/nia-toggle updates BOTH this cache and the DB row
// so the state survives Railway redeploys.
let niaEnabled: boolean = process.env.NIA_ENABLED !== "false";

// initNiaEnabled — called once at startup. Reads the persisted value from
// system_settings so the server boots in the correct state after a redeploy.
export async function initNiaEnabled(): Promise<void> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    if (row) {
      niaEnabled = row.value !== "false";
      logger.info({ niaEnabled }, "admin: Nia enabled state loaded from DB");
    }
  } catch (err) {
    logger.warn({ err }, "admin: could not read nia_enabled from system_settings, using default");
  }
}

// GET /admin/nia-status — public, no auth. Frontend polls this to know
// whether to show the NiaFab and drawer. Returns { enabled: boolean }.
router.get("/admin/nia-status", (_req, res) => {
  return res.json({ enabled: niaEnabled });
});

// POST /admin/nia-toggle — admin only. Body: { enabled: boolean }
router.post("/admin/nia-toggle", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const { enabled } = req.body as { enabled?: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled (boolean) is required" });
  }

  // 1. Update in-process cache immediately so the proxy reacts with no lag
  niaEnabled = enabled;

  // 2. Persist to DB so the value survives redeploys
  try {
    await db
      .insert(systemSettingsTable)
      .values({ key: "nia_enabled", value: enabled ? "true" : "false" })
      .onConflictDoUpdate({
        target: systemSettingsTable.key,
        set: { value: enabled ? "true" : "false", updated_at: new Date() },
      });
  } catch (err) {
    logger.error({ err }, "admin: failed to persist nia_enabled to system_settings");
  }

  logger.info({ niaEnabled }, "admin: Nia AI toggled");
  return res.json({ ok: true, enabled: niaEnabled });
});

// POST /admin/trigger-checkin-worker — manually fire the Nia check-in worker (admin only)
// Useful for testing without waiting 24h for a real completed request
router.post("/nia/trigger-checkin", async (req, res) => {
  const adminSecret = (req.headers["x-admin-secret"] as string | undefined) ?? String((req.body as Record<string,unknown>)?.secret ?? "");
  if (!adminSecret || adminSecret !== (process.env.ADMIN_SECRET ?? "")) return res.status(403).json({ error: "Forbidden" });
  const body = req.body as Record<string, unknown>;
  const userId    = typeof body.userId    === "number" ? body.userId    : 1;
  const userName  = typeof body.userName  === "string" ? body.userName  : "Test User";
  const requestTitle = typeof body.requestTitle === "string" ? body.requestTitle : "test request";
  const category  = typeof body.category  === "string" ? body.category  : "other";
  const helperName = typeof body.helperName === "string" ? body.helperName : null;
  const sessionId  = `checkin-${userId}-manual-${Date.now()}`;

  const niaUrl = (process.env.NIA_SERVICE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const secret = process.env.INTERNAL_SECRET ?? "";

  try {
    const upstream = await fetch(`${niaUrl}/checkin`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify({ userId, userName, sessionId, requestTitle, category, helperName }),
    });
    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }
    const data = await upstream.json();
    return res.json({ ok: true, sessionId, ...(data as Record<string, unknown>) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? "Failed to trigger checkin" });
  }
});


// Export the flag so nia-proxy can read it from the same process
export { niaEnabled };

export default router;
