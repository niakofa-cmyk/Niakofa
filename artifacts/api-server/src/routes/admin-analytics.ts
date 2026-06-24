/**
 * Niakofa — Admin Analytics Routes
 *
 * Provides aggregated platform health data for the admin dashboard.
 * All routes require authentication + admin role.
 */
import { Router } from "express";
import { db, requestsTable, usersTable, reportsTable } from "@workspace/db";
import { eq, sql, and, gte } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";

const router = Router();

// GET /admin/analytics — comprehensive platform health snapshot
router.get("/admin/analytics", requireAuth, requireAdmin(), async (_req, res) => {
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
  ]);

  const openCount = statusCounts.find(s => s.status === "open")?.count ?? 0;
  const completedCount = statusCounts.find(s => s.status === "completed")?.count ?? 0;

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
  });
});

export default router;

// GET /admin/accounts — list all accounts for admin review
router.get("/admin/accounts", requireAuth, requireAdmin(), async (req, res) => {
  const { approval_status, account_type } = req.query as {
    approval_status?: string;
    account_type?: string;
  };

  const conditions = [];
  if (approval_status) conditions.push(eq(usersTable.approval_status, approval_status));
  if (account_type) conditions.push(eq(usersTable.account_type, account_type));

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
      organization_name: usersTable.organization_name,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(usersTable.created_at);

  return res.json(users);
});

// GET /admin/helper-applications — list users who have applied to be helpers
router.get("/admin/helper-applications", requireAuth, requireAdmin(), async (req, res) => {
  const { status } = req.query as { status?: string };

  const conditions = [sql`${usersTable.helper_status} IS NOT NULL`];
  if (status) conditions.push(eq(usersTable.helper_status, status));

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
    .orderBy(usersTable.created_at);

  return res.json(applicants);
});

// POST /admin/verify-secret — verify admin secret server-side (never exposes secret to frontend bundle)
router.post("/admin/verify-secret", requireAuth, requireAdmin(), async (_req, res) => {
  const secret = (_req.body as { secret?: string }).secret;
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return res.status(500).json({ error: "ADMIN_SECRET not configured" });
  if (secret !== expected) return res.status(403).json({ error: "Incorrect secret" });
  return res.json({ ok: true });
});
