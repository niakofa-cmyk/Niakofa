/**
 * Admin-only Community Pool settlement operations.
 *
 * Verification is system-controlled and read-only here. The only mutation is
 * the explicit, audited mark-paid-out action after verified + available.
 */
import { Router } from "express";
import Stripe from "stripe";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  communityPoolFinancialEventsTable,
  communityPoolFinancialAuditEventsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import {
  markPoolSettlementPaidOut,
  PoolSettlementTransitionError,
} from "../lib/mark-pool-settlement-paid-out";
import { getStripeSecretKey } from "../lib/stripe-config";

const router = Router();
const stripeSecret = getStripeSecretKey();
const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;
const settlementStatuses = new Set(["pending", "available", "paid_out", "failed"]);
const verificationStatuses = new Set(["unverified", "verified", "verification_failed"]);

router.get("/admin/pool/settlements", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const settlementStatus = typeof req.query.settlement_status === "string" ? req.query.settlement_status : undefined;
  const verificationStatus = typeof req.query.verification_status === "string" ? req.query.verification_status : undefined;
  if (settlementStatus && !settlementStatuses.has(settlementStatus)) {
    return res.status(400).json({ error: "Invalid settlement_status filter." });
  }
  if (verificationStatus && !verificationStatuses.has(verificationStatus)) {
    return res.status(400).json({ error: "Invalid verification_status filter." });
  }

  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
  const conditions = [
    settlementStatus ? eq(communityPoolFinancialEventsTable.settlement_status, settlementStatus) : undefined,
    verificationStatus ? eq(communityPoolFinancialEventsTable.stripe_verification_status, verificationStatus) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  try {
    const rows = await db
      .select()
      .from(communityPoolFinancialEventsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(communityPoolFinancialEventsTable.created_at))
      .limit(limit)
      .offset(offset);
    return res.json({ settlements: rows.map(serializeFinancialEvent), limit, offset, count: rows.length });
  } catch (error) {
    logger.error({ err: error }, "GET /admin/pool/settlements failed");
    return res.status(500).json({ error: "Failed to load Community Pool settlements." });
  }
});

router.get("/admin/pool/settlements/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = Number.parseInt(String(req.params.id ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid settlement id." });

  try {
    const [event] = await db
      .select()
      .from(communityPoolFinancialEventsTable)
      .where(eq(communityPoolFinancialEventsTable.id, id))
      .limit(1);
    if (!event) return res.status(404).json({ error: "Settlement not found." });

    const auditEvents = await db
      .select({
        id: communityPoolFinancialAuditEventsTable.id,
        action: communityPoolFinancialAuditEventsTable.action,
        actor_user_id: communityPoolFinancialAuditEventsTable.actor_user_id,
        actor_name: usersTable.name,
        reference: communityPoolFinancialAuditEventsTable.reference,
        note: communityPoolFinancialAuditEventsTable.note,
        created_at: communityPoolFinancialAuditEventsTable.created_at,
      })
      .from(communityPoolFinancialAuditEventsTable)
      .leftJoin(usersTable, eq(usersTable.id, communityPoolFinancialAuditEventsTable.actor_user_id))
      .where(eq(communityPoolFinancialAuditEventsTable.financial_event_id, id))
      .orderBy(desc(communityPoolFinancialAuditEventsTable.created_at));

    return res.json({ settlement: serializeFinancialEvent(event), audit_events: auditEvents });
  } catch (error) {
    logger.error({ err: error, id }, "GET /admin/pool/settlements/:id failed");
    return res.status(500).json({ error: "Failed to load settlement detail." });
  }
});

router.post(
  "/admin/pool/settlements/:id/mark-paid-out",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req, res) => {
    const id = Number.parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid settlement id." });

    const body = (req.body ?? {}) as { payout_reference?: unknown; note?: unknown };
    const payoutReference = typeof body.payout_reference === "string" ? body.payout_reference.trim() : "";
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    if (!payoutReference) {
      return res.status(400).json({ error: "payout_reference is required." });
    }
    if (payoutReference.length > 200) {
      return res.status(400).json({ error: "payout_reference is too long (max 200 characters)." });
    }

    const operatorId = req.authenticatedUserId;
    if (!operatorId) return res.status(401).json({ error: "Authentication required." });

    try {
      const result = await markPoolSettlementPaidOut({
        financialEventId: id,
        operatorId,
        payoutReference,
        note,
        stripe,
      });
      return res.json({
        id: result.id,
        settlement_status: result.settlementStatus,
        paid_out_at: result.paidOutAt,
        paid_out_by: result.paidOutBy,
        paid_out_reference: result.paidOutReference,
      });
    } catch (error) {
      if (error instanceof PoolSettlementTransitionError) {
        const status = error.code === "not_found" ? 404 : 409;
        logger.warn({ err: error, financial_event_id: id, operator_id: operatorId }, "mark-paid-out rejected");
        return res.status(status).json({ error: error.message, code: error.code });
      }
      logger.error({ err: error, financial_event_id: id, operator_id: operatorId }, "mark-paid-out failed");
      return res.status(500).json({ error: "Failed to mark settlement paid out." });
    }
  },
);

function serializeFinancialEvent(event: typeof communityPoolFinancialEventsTable.$inferSelect) {
  return {
    ...event,
    stripe_verification_status: event.stripe_verification_status,
    settlement_status: event.settlement_status,
  };
}

export default router;