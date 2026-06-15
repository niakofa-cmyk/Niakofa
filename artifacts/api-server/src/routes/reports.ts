import { timingSafeEqual } from "crypto";
import { Router } from "express";
import { db, reportsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { requireAuth, isSelf } from "../middlewares/auth";

const router = Router();

const CreateReportBody = z.object({
  reporter_id: z.number().int().positive(),
  reported_user_id: z.number().int().positive().optional(),
  reported_request_id: z.number().int().positive().optional(),
  type: z.enum([
    "suspicious_request",
    "suspicious_helper",
    "fraud",
    "harassment",
    "fake_profile",
    "dangerous_behavior",
    "spam",
    "other",
  ]),
  description: z.string().min(10).max(2000),
}).refine(d => d.reported_user_id || d.reported_request_id, {
  message: "Must specify either reported_user_id or reported_request_id",
});

const AdminReviewBody = z.object({
  status: z.enum([
    "under_review",
    "resolved_dismissed",
    "resolved_warned",
    "resolved_banned",
  ]),
  admin_notes: z.string().max(2000).optional(),
  reviewed_by: z.number().int().positive(),
});

// ── Admin auth middleware ──────────────────────────────────────────────────
function requireAdmin(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) {
  const token = req.headers["x-admin-token"] as string | undefined;
  const adminSecret = process.env.ADMIN_SECRET;
  // Use constant-time comparison to prevent timing attacks.
  // Plain string equality (===) leaks information about how many characters match.
  if (!adminSecret || !token) {
    return res.status(401).json({ error: "Unauthorized: invalid admin token" });
  }
  try {
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(adminSecret);
    if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
      return res.status(401).json({ error: "Unauthorized: invalid admin token" });
    }
  } catch {
    return res.status(401).json({ error: "Unauthorized: invalid admin token" });
  }
  return next();
}

// ── POST /reports — file a new report (requires auth; reporter_id must match token) ──
router.post("/reports", requireAuth, async (req, res) => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { reporter_id, reported_user_id, reported_request_id, type, description } = parsed.data;

  // Ensure the authenticated user is the reporter — prevents filing reports on behalf of others.
  if (!isSelf(req, reporter_id)) {
    return res.status(403).json({ error: "Forbidden — reporter_id must match your authenticated user ID" });
  }

  // Prevent self-report
  if (reported_user_id && reported_user_id === reporter_id) {
    return res.status(400).json({ error: "Cannot report yourself" });
  }

  // Rate-limit: max 5 reports per user per 24 hours
  const [recentCount] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.reporter_id, reporter_id),
        sql`${reportsTable.created_at} > NOW() - INTERVAL '24 hours'`
      )
    );
  if ((recentCount?.count ?? 0) >= 5) {
    return res.status(429).json({
      error: "You've submitted too many reports today. Please wait 24 hours before reporting again.",
    });
  }

  const [report] = await db
    .insert(reportsTable)
    .values({
      reporter_id,
      reported_user_id: reported_user_id ?? null,
      reported_request_id: reported_request_id ?? null,
      type,
      description,
      status: "pending",
    })
    .returning();

  logger.info(
    { report_id: report.id, reporter_id, type, reported_user_id, reported_request_id },
    "trust-safety: new report filed"
  );

  broadcast({
    type: "new_report",
    payload: { id: report.id, type, status: "pending", created_at: report.created_at },
  });

  return res.status(201).json(report);
});

// ── GET /reports — admin: list all reports ────────────────────────────────
router.get("/reports", requireAdmin, async (req, res) => {
  const status = req.query.status as string | undefined;
  const validStatuses = ["pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];

  let rows = await db
    .select()
    .from(reportsTable)
    .orderBy(desc(reportsTable.created_at))
    .limit(200);

  if (status && validStatuses.includes(status)) {
    rows = rows.filter(r => r.status === status);
  }

  return res.json(rows);
});

// ── GET /reports/:id — admin: get a single report ─────────────────────────
router.get("/reports/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!report) return res.status(404).json({ error: "Report not found" });

  const [reporter] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, report.reporter_id))
    .limit(1);

  let reportedUserName: string | null = null;
  if (report.reported_user_id) {
    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, report.reported_user_id))
      .limit(1);
    reportedUserName = u?.name ?? null;
  }

  return res.json({
    ...report,
    reporter_name: reporter?.name ?? null,
    reporter_email: reporter?.email ?? null,
    reported_user_name: reportedUserName,
  });
});

// ── PATCH /reports/:id/review — admin: update report status ───────────────
router.patch("/reports/:id/review", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = AdminReviewBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { status, admin_notes, reviewed_by } = parsed.data;

  const [updated] = await db
    .update(reportsTable)
    .set({
      status,
      admin_notes: admin_notes ?? null,
      reviewed_by,
      reviewed_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(reportsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Report not found" });

  logger.info({ report_id: id, status, reviewed_by }, "trust-safety: report reviewed");

  broadcast({
    type: "report_reviewed",
    payload: { id, status, reviewed_by },
  });

  return res.json(updated);
});

// ── GET /users/:id/reports — authenticated; users can only see their OWN reports ──
// This endpoint previously had no authentication, leaking any user's report history
// to anyone who knew their user ID. Now requires a valid token matching the :id.
router.get("/users/:id/reports", requireAuth, async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  if (!isSelf(req, userId)) {
    return res.status(403).json({ error: "Forbidden — you can only view your own reports" });
  }

  const filed = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.reporter_id, userId))
    .orderBy(desc(reportsTable.created_at))
    .limit(50);

  return res.json(filed);
});

export default router;
