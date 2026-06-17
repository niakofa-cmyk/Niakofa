import { Router } from "express";
import { db, reportsTable, usersTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";

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

// ── POST /reports — file a new report ─────────────────────────────────────
router.post("/reports", async (req, res) => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
  }

  const { reporter_id, reported_user_id, reported_request_id, type, description } = parsed.data;

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

  // Broadcast to admin clients so the queue updates in real-time
  broadcast({
    type: "new_report",
    payload: { id: report.id, type, status: "pending", created_at: report.created_at },
  });

  return res.status(201).json(report);
});

// ── GET /reports — admin: list all reports with optional status filter ─────
router.get("/reports", async (req, res) => {
  const status = req.query.status as string | undefined;
  const validStatuses = ["pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
  const validStatus = status && validStatuses.includes(status) ? status : undefined;

  const rows = await db
    .select()
    .from(reportsTable)
    .where(validStatus ? eq(reportsTable.status, validStatus) : undefined)
    .orderBy(desc(reportsTable.created_at))
    .limit(200);

  return res.json(rows);
});

// ── GET /reports/:id — admin: get a single report ─────────────────────────
router.get("/reports/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, id))
    .limit(1);

  if (!report) return res.status(404).json({ error: "Report not found" });

  // Enrich with reporter name for admin UI
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

// ── PATCH /reports/:id/review — admin: update report status + notes ───────
router.patch("/reports/:id/review", async (req, res) => {
  const id = parseInt(req.params.id);
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

  logger.info(
    { report_id: id, status, reviewed_by },
    "trust-safety: report reviewed"
  );

  broadcast({
    type: "report_reviewed",
    payload: { id, status, reviewed_by },
  });

  return res.json(updated);
});

// ── GET /users/:id/reports — get all reports filed by or against a user ───
router.get("/users/:id/reports", async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ error: "Invalid id" });

  const filed = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.reporter_id, userId))
    .orderBy(desc(reportsTable.created_at))
    .limit(50);

  return res.json(filed);
});

export default router;
