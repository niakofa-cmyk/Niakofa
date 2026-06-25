import { Router } from "express";
import { db, reportsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql, or } from "drizzle-orm";
import { z } from "zod";
import { broadcast, broadcastToAdmins } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";

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
  // reviewed_by is derived from the authenticated user token — not client-supplied
  admin_notes: z.string().max(2000).optional(),
});

// ── POST /reports — file a new report ─────────────────────────────────────
router.post("/reports", requireAuth, async (req, res) => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { reporter_id, reported_user_id, reported_request_id, type, description } = parsed.data;

  // Ensure reporter_id matches authenticated user (prevent filing as someone else)
  if (req.authenticatedUserId !== reporter_id) {
    return res.status(403).json({ error: "reporter_id must match your authenticated user" });
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

  // Broadcast to admin clients only — reports contain sensitive details
  // about other users and should never reach a regular connected client.
  broadcastToAdmins({
    type: "new_report",
    payload: { id: report.id, type, status: "pending", created_at: report.created_at },
  });

  return res.status(201).json(report);
});

// ── GET /reports — admin: list all reports with optional status filter ─────
router.get("/reports", requireAuth, requireAdmin(), async (req, res) => {
  const status = req.query.status as string | undefined;
  const validStatuses = ["pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
  const validStatus = status && validStatuses.includes(status) ? status : undefined;

  const rows = await db
    .select()
    .from(reportsTable)
    .where(validStatus ? eq(reportsTable.status, validStatus as "pending" | "under_review" | "resolved_dismissed" | "resolved_warned" | "resolved_banned") : undefined)
    .orderBy(desc(reportsTable.created_at))
    .limit(200);

  return res.json(rows);
});

// ── GET /reports/:id — admin: get a single report ─────────────────────────
router.get("/reports/:id", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!report) return res.status(404).json({ error: "Report not found" });

  // Enrich with reporter name for admin UI — reporter_id can be null if
  // that account was since deleted (FK onDelete: "set null").
  const reporter = report.reporter_id
    ? (await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, report.reporter_id)).limit(1))[0]
    : undefined;

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

// ── PATCH /reports/:id/review — admin: update report status + notes ───────
router.patch("/reports/:id/review", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = AdminReviewBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { status, admin_notes } = parsed.data;
  // reviewed_by comes from the verified auth token — never from the client body
  const reviewed_by = req.authenticatedUserId!;

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

  // resolved_banned must actually ban the reported user, not just label the
  // report — previously this only updated report metadata, leaving the
  // user fully active despite the report reading "banned".
  if (status === "resolved_banned" && updated.reported_user_id) {
    await db.update(usersTable)
      .set({
        trust_score: -1,
        helper_mode_active: false,
        token_version: sql`${usersTable.token_version} + 1`,
      })
      .where(eq(usersTable.id, updated.reported_user_id));
    logger.warn(
      { report_id: id, banned_user_id: updated.reported_user_id },
      "trust-safety: user banned via report resolution"
    );
  }

  logger.info(
    { report_id: id, status, reviewed_by },
    "trust-safety: report reviewed"
  );

  broadcastToAdmins({
    type: "report_reviewed",
    payload: { id, status, reviewed_by },
  });

  return res.json(updated);
});

// ── GET /users/:id/reports — admin: get all reports filed by or against a user
router.get("/users/:id/reports", requireAuth, requireAdmin(), async (req, res) => {
  const userId = parseInt(String(req.params.id));
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  // BUG-M06: return reports the user filed AND reports filed against them
  const filed = await db
    .select()
    .from(reportsTable)
    .where(or(
      eq(reportsTable.reporter_id, userId),
      eq(reportsTable.reported_user_id, userId)
    ))
    .orderBy(desc(reportsTable.created_at))
    .limit(50);

  return res.json(filed);
});

export default router;
