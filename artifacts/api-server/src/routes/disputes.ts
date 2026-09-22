/**
 * Dispute Resolution Routes
 *
 * Closes the structural gap identified in multiple audit rounds:
 * "Dispute resolution — still no dispute logic in routes/lib. Genuinely missing."
 *
 * Lifecycle:
 *   POST   /requests/:id/dispute          — file a dispute (requester or assigned helper)
 *   GET    /requests/:id/dispute          — get the calling user's dispute for this request
 *   GET    /admin/disputes                — admin: all disputes (filterable by status)
 *   PATCH  /admin/disputes/:id/status     — admin: move to under_review / resolved / dismissed
 *
 * Design:
 *   - One active dispute per user per request (unique index enforced in DB)
 *   - Admin owns all state transitions beyond "open"
 *   - Resolution text is recorded for audit trail
 *   - Push notification sent to disputing party on resolution
 */
import { Router } from "express";
import { db, disputesTable, requestsTable, usersTable } from "@workspace/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { requireAdmin } from "../middlewares/authz.js";
import { generalApiLimiter, adminLimiter } from "../middlewares/rate-limit.js";
import { logger } from "../lib/logger.js";
import { sendPushToUser } from "./push.js";
import { z } from "zod";

const router = Router();

// ── File a dispute ─────────────────────────────────────────────────────────────
// Either the requester OR the assigned helper on a completed/cancelled request
// may open a dispute. For safety, we allow disputes on any request in a
// non-open state — "open" requests haven't started, so there's nothing to dispute.
router.post(
  "/requests/:id/dispute",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const requestId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id ?? "", 10);
    if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request ID" });

    const userId = req.authenticatedUserId!;

    const bodySchema = z.object({
      reason:       z.string().min(10).max(500),
      details:      z.string().max(2000).optional(),
      against_user: z.number().int().positive().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });

    // Validate the request exists and involves this user
    const [helpRequest] = await db
      .select({ id: requestsTable.id, status: requestsTable.status, requester_id: requestsTable.requester_id, helper_id: requestsTable.helper_id })
      .from(requestsTable)
      .where(eq(requestsTable.id, requestId))
      .limit(1);

    if (!helpRequest) return res.status(404).json({ error: "Request not found" });

    // Only involved parties can dispute
    if (helpRequest.requester_id !== userId && helpRequest.helper_id !== userId) {
      return res.status(403).json({ error: "You are not a participant in this request" });
    }

    // Disputes only make sense after a request has started (claimed or further)
    if (helpRequest.status === "open") {
      return res.status(400).json({ error: "This request has not been accepted yet — disputes apply to in-progress or completed requests" });
    }

    // Insert — the unique index prevents a second active dispute from the same user
    try {
      const [dispute] = await db
        .insert(disputesTable)
        .values({
          request_id:   requestId,
          opened_by:    userId,
          against_user: parsed.data.against_user ?? (helpRequest.requester_id === userId ? helpRequest.helper_id ?? undefined : helpRequest.requester_id) ?? undefined,
          reason:       parsed.data.reason,
          details:      parsed.data.details ?? null,
          status:       "open",
        })
        .returning();

      logger.info({ dispute_id: dispute?.id, request_id: requestId, opened_by: userId }, "dispute: filed");
      return res.status(201).json({ dispute });
    } catch (err: unknown) {
      // Unique constraint violation — duplicate active dispute
      if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
        return res.status(409).json({ error: "You already have an active dispute for this request. Contact an admin if you need to update it." });
      }
      logger.error({ err, request_id: requestId }, "dispute: insert failed");
      return res.status(500).json({ error: "Failed to file dispute" });
    }
  }
);

// ── Get caller's dispute for a request ────────────────────────────────────────
router.get(
  "/requests/:id/dispute",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const requestId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id ?? "", 10);
    if (isNaN(requestId)) return res.status(400).json({ error: "Invalid request ID" });

    const userId = req.authenticatedUserId!;

    const [dispute] = await db
      .select()
      .from(disputesTable)
      .where(and(eq(disputesTable.request_id, requestId), eq(disputesTable.opened_by, userId)))
      .orderBy(desc(disputesTable.created_at))
      .limit(1);

    if (!dispute) return res.status(404).json({ error: "No dispute found" });
    return res.json({ dispute });
  }
);

// ── Admin: list all disputes ───────────────────────────────────────────────────
router.get(
  "/admin/disputes",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req, res) => {
    const statusFilter = (req.query.status as string) ?? "open";
    const limit  = Math.min(parseInt(req.query.limit  as string ?? "50", 10), 200);
    const offset = parseInt(req.query.offset as string ?? "0", 10);

    const validStatuses = ["open", "under_review", "resolved", "dismissed", "all"] as const;
    if (!validStatuses.includes(statusFilter as typeof validStatuses[number])) {
      return res.status(400).json({ error: "Invalid status filter" });
    }

    const whereClause =
      statusFilter === "all"
        ? undefined
        : eq(disputesTable.status, statusFilter);

    const rows = await db
      .select({
        dispute: disputesTable,
        opener_name:  usersTable.name,
        opener_email: usersTable.email,
      })
      .from(disputesTable)
      .leftJoin(usersTable, eq(disputesTable.opened_by, usersTable.id))
      .where(whereClause)
      .orderBy(desc(disputesTable.created_at))
      .limit(limit)
      .offset(offset);

    // Enrich with against_user name
    const againstIds = [...new Set(rows.map(r => r.dispute.against_user).filter((v): v is number => v != null))];
    const againstUsers =
      againstIds.length > 0
        ? await db
            .select({ id: usersTable.id, name: usersTable.name })
            .from(usersTable)
            .where(inArray(usersTable.id, againstIds))
        : [];
    const againstMap = Object.fromEntries(againstUsers.map(u => [u.id, u.name]));

    // Count totals for UI
    const [countRow] = await db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(disputesTable)
      .where(whereClause);

    const disputes = rows.map(r => ({
      ...r.dispute,
      opener_name:  r.opener_name,
      opener_email: r.opener_email,
      against_user_name: r.dispute.against_user ? (againstMap[r.dispute.against_user] ?? null) : null,
    }));

    return res.json({ disputes, total: countRow?.total ?? 0 });
  }
);

// ── Admin: update dispute status ───────────────────────────────────────────────
router.patch(
  "/admin/disputes/:id/status",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req, res) => {
    const disputeId = parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id ?? "", 10);
    if (isNaN(disputeId)) return res.status(400).json({ error: "Invalid dispute ID" });

    const adminId = req.authenticatedUserId!;

    const bodySchema = z.object({
      status:     z.enum(["under_review", "resolved", "dismissed"]),
      resolution: z.string().max(2000).optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });

    const [existing] = await db
      .select()
      .from(disputesTable)
      .where(eq(disputesTable.id, disputeId))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Dispute not found" });

    // Prevent re-opening a resolved/dismissed dispute via this endpoint
    if (existing.status === "resolved" || existing.status === "dismissed") {
      return res.status(409).json({
        error: `Dispute is already ${existing.status}. Contact a super-admin to reopen.`,
        current_status: existing.status,
      });
    }

    const isTerminal = parsed.data.status === "resolved" || parsed.data.status === "dismissed";
    // Atomic: the WHERE clause guards against concurrent admin actions overwriting a
    // terminal state — if another request already resolved/dismissed this dispute,
    // the UPDATE matches 0 rows and we return a 409 rather than silently overwriting.
    const [updated] = await db
      .update(disputesTable)
      .set({
        status:       parsed.data.status,
        resolution:   parsed.data.resolution ?? null,
        resolved_by:  isTerminal ? adminId : null,
        resolved_at:  isTerminal ? new Date() : null,
        updated_at:   new Date(),
      })
      .where(
        and(
          eq(disputesTable.id, disputeId),
          sql`${disputesTable.status} NOT IN ('resolved', 'dismissed')`
        )
      )
      .returning();

    // If 0 rows updated, a concurrent admin beat us to a terminal transition
    if (!updated) {
      const [current] = await db.select({ status: disputesTable.status }).from(disputesTable).where(eq(disputesTable.id, disputeId)).limit(1);
      return res.status(409).json({
        error: `Dispute is already ${current?.status ?? "terminal"}. Concurrent update conflict.`,
        current_status: current?.status ?? null,
      });
    }

    logger.info(
      { dispute_id: disputeId, new_status: parsed.data.status, admin_id: adminId },
      "dispute: status updated by admin"
    );

    // Notify the user who filed the dispute when it's resolved/dismissed
    if (isTerminal) {
      const statusLabel = parsed.data.status === "resolved" ? "resolved" : "dismissed";
      sendPushToUser(existing.opened_by, {
        title: `Your dispute has been ${statusLabel}`,
        body: parsed.data.resolution
          ? `Admin note: ${parsed.data.resolution.slice(0, 100)}`
          : `Your dispute (Request #${existing.request_id}) has been ${statusLabel} by an admin.`,
        urgency: "normal",
        requestId: existing.request_id,
        notifType: "community" as const,
      }).catch((err) => {
        logger.warn({ err, dispute_id: disputeId, opened_by: existing.opened_by }, "dispute: push notification failed (best-effort)");
      });
    }

    return res.json({ dispute: updated });
  }
);

export default router;
