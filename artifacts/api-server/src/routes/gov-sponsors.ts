/**
 * Government / County Sponsor Routes
 *
 * Endpoints for county and government entities to apply as named community pool
 * sponsors. Follows the same approval-queue pattern as businesses.ts.
 *
 * POST   /gov-sponsors                    — submit an application (authenticated user)
 * GET    /gov-sponsors/mine               — list my own applications
 * POST   /gov-sponsors/:id/fund           — fund the pool from an approved sponsor (admin)
 * POST   /gov-sponsors/:id/subsidize-pledge — county pays down a defaulted pledge (admin)
 * GET    /admin/gov-sponsors              — list all (admin only)
 * PATCH  /admin/gov-sponsors/:id/approve  — approve or reject (admin only)
 */
import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { db, governmentSponsorsTable, usersTable, requestsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { recordPoolContribution, processPendingMinimums, getPoolBalance } from "../lib/community-pool";
import { broadcast } from "../lib/ws-hub";

const router = Router();

// ── POST /gov-sponsors — submit a government/county sponsor application ─────────
router.post("/gov-sponsors", requireAuth, generalApiLimiter, async (req, res) => {
  const submittedBy = req.authenticatedUserId!;

  const {
    entity_name,
    county,
    state,
    city,
    contact_name,
    contact_email,
    contact_phone,
    description,
    website_url,
  } = req.body as {
    entity_name?: string;
    county?: string;
    state?: string;
    city?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
    description?: string;
    website_url?: string;
  };

  if (!entity_name?.trim()) return res.status(400).json({ error: "entity_name is required." });
  if (!county?.trim())       return res.status(400).json({ error: "county is required." });
  if (!state?.trim())        return res.status(400).json({ error: "state is required." });
  if (!contact_name?.trim()) return res.status(400).json({ error: "contact_name is required." });
  if (!contact_email?.trim()) return res.status(400).json({ error: "contact_email is required." });

  const [created] = await db
    .insert(governmentSponsorsTable)
    .values({
      entity_name: entity_name.trim(),
      county: county.trim(),
      state: state.trim().toUpperCase(),
      city: city?.trim() ?? null,
      contact_name: contact_name.trim(),
      contact_email: contact_email.trim().toLowerCase(),
      contact_phone: contact_phone?.trim() ?? null,
      description: description?.trim() ?? null,
      website_url: website_url?.trim() ?? null,
      submitted_by_user_id: submittedBy,
    })
    .returning();

  logger.info(
    { gov_sponsor_id: created.id, entity: created.entity_name, submitted_by: submittedBy },
    "gov-sponsor: application submitted",
  );
  return res.status(201).json(created);
});

// ── GET /gov-sponsors/mine — list caller's own applications ──────────────────
router.get("/gov-sponsors/mine", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const rows = await db
    .select()
    .from(governmentSponsorsTable)
    .where(eq(governmentSponsorsTable.submitted_by_user_id, userId))
    .orderBy(governmentSponsorsTable.created_at);
  return res.json(rows);
});

// ── GET /admin/gov-sponsors — list all applications (admin only) ─────────────
router.get(
  "/admin/gov-sponsors",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (_req, res) => {
    const rows = await db
      .select({
        id: governmentSponsorsTable.id,
        entity_name: governmentSponsorsTable.entity_name,
        county: governmentSponsorsTable.county,
        state: governmentSponsorsTable.state,
        city: governmentSponsorsTable.city,
        contact_name: governmentSponsorsTable.contact_name,
        contact_email: governmentSponsorsTable.contact_email,
        contact_phone: governmentSponsorsTable.contact_phone,
        description: governmentSponsorsTable.description,
        website_url: governmentSponsorsTable.website_url,
        approval_status: governmentSponsorsTable.approval_status,
        admin_notes: governmentSponsorsTable.admin_notes,
        submitted_by_user_id: governmentSponsorsTable.submitted_by_user_id,
        reviewed_at: governmentSponsorsTable.reviewed_at,
        reviewed_by_user_id: governmentSponsorsTable.reviewed_by_user_id,
        created_at: governmentSponsorsTable.created_at,
        submitter_name: usersTable.name,
        submitter_email: usersTable.email,
      })
      .from(governmentSponsorsTable)
      .leftJoin(
        usersTable,
        eq(governmentSponsorsTable.submitted_by_user_id, usersTable.id),
      )
      .orderBy(governmentSponsorsTable.created_at);
    return res.json(rows);
  },
);

// ── POST /gov-sponsors/:id/fund — fund the community pool from an approved sponsor ─
// Admin-only: records an inbound contribution from a government/county sponsor.
// Body: { amount: number, notes?: string }
// The sponsor must be in "approved" state. Amount is in dollars (positive).
// After recording the contribution, backfills any queued helpers who were
// waiting because the pool was empty (processPendingMinimums), then broadcasts
// a real-time pool_updated event so the frontend balance reflects instantly.
router.post(
  "/gov-sponsors/:id/fund",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req, res) => {
    const sponsorId = parseInt(req.params.id as string, 10);
    if (isNaN(sponsorId)) return res.status(400).json({ error: "Invalid sponsor id" });

    const rawAmount = (req.body as { amount?: unknown }).amount;
    const amount = typeof rawAmount === "number" ? rawAmount : parseFloat(String(rawAmount ?? ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number (dollars)." });
    }

    const [sponsor] = await db
      .select({ id: governmentSponsorsTable.id, entity_name: governmentSponsorsTable.entity_name, approval_status: governmentSponsorsTable.approval_status })
      .from(governmentSponsorsTable)
      .where(eq(governmentSponsorsTable.id, sponsorId))
      .limit(1);

    if (!sponsor) return res.status(404).json({ error: "Government sponsor not found." });
    if (sponsor.approval_status !== "approved") {
      return res.status(403).json({
        error: `"${sponsor.entity_name}" is not yet approved. Approve the sponsor before recording a pool contribution.`,
        approval_status: sponsor.approval_status,
      });
    }

    const customNotes = (req.body as { notes?: string }).notes?.trim();
    const notes = customNotes || `Pool funding from ${sponsor.entity_name} (Gov Sponsor #${sponsorId})`;

    const recorded = await recordPoolContribution({
      amount,
      userId: req.authenticatedUserId!,
      notes,
      governmentSponsorId: sponsorId,
    });

    if (!recorded) {
      return res.status(409).json({ error: "Contribution already recorded (duplicate detected)." });
    }

    // Backfill helpers who were waiting because the pool was empty.
    const backfilled = await processPendingMinimums().catch((err: unknown) => {
      logger.error({ err }, "gov-sponsor fund: processPendingMinimums failed (non-fatal)");
      return 0;
    });

    const newBalance = await getPoolBalance();

    broadcast({ type: "pool_updated", payload: { balance: newBalance } });

    logger.info(
      { gov_sponsor_id: sponsorId, entity: sponsor.entity_name, amount, backfilled, new_balance: newBalance },
      "gov-sponsor: pool funding recorded",
    );

    return res.status(201).json({
      gov_sponsor_id: sponsorId,
      entity_name: sponsor.entity_name,
      amount_contributed: amount,
      backfilled_helpers: backfilled,
      new_pool_balance: newBalance,
    });
  },
);

// ── POST /gov-sponsors/:id/subsidize-pledge — county pays down a defaulted pledge ─
// Admin-only: an approved county/gov sponsor forgives a requester's defaulted
// (or active) PIF pledge. This records a pool contribution from the sponsor and
// sets the pledge to 'forgiven' (admin-granted charity). The requester receives
// a partial trust_score restoration (+5) to signal the county stood behind them.
//
// Design note: this is NOT self-service repayment. It is admin-mediated county
// co-signing — the county covers the requester's obligation. Use /fund for
// direct pool contributions not tied to a specific pledge.
router.post(
  "/gov-sponsors/:id/subsidize-pledge",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req, res) => {
    const sponsorId = parseInt(req.params.id as string, 10);
    if (isNaN(sponsorId)) return res.status(400).json({ error: "Invalid sponsor id" });

    const rawRequestId = (req.body as { request_id?: unknown }).request_id;
    const requestId = typeof rawRequestId === "number" ? rawRequestId : parseInt(String(rawRequestId ?? ""), 10);
    if (isNaN(requestId) || requestId < 1) {
      return res.status(400).json({ error: "request_id (the help request with the outstanding pledge) is required." });
    }

    const rawAmount = (req.body as { amount?: unknown }).amount;
    const customNotes = (req.body as { notes?: string }).notes?.trim();

    // Validate the sponsor is approved before doing anything
    const [sponsor] = await db
      .select({ id: governmentSponsorsTable.id, entity_name: governmentSponsorsTable.entity_name, approval_status: governmentSponsorsTable.approval_status })
      .from(governmentSponsorsTable)
      .where(eq(governmentSponsorsTable.id, sponsorId))
      .limit(1);

    if (!sponsor) return res.status(404).json({ error: "Government sponsor not found." });
    if (sponsor.approval_status !== "approved") {
      return res.status(403).json({
        error: `"${sponsor.entity_name}" is not yet approved. Approve the sponsor first.`,
        approval_status: sponsor.approval_status,
      });
    }

    // Fetch the request and validate pledge eligibility
    const [helpRequest] = await db
      .select({
        id: requestsTable.id,
        requester_id: requestsTable.requester_id,
        pledge_status: requestsTable.pledge_status,
        pledge_amount: requestsTable.pledge_amount,
        pledge_paid: requestsTable.pledge_paid,
        payment_type: requestsTable.payment_type,
      })
      .from(requestsTable)
      .where(eq(requestsTable.id, requestId))
      .limit(1);

    if (!helpRequest) return res.status(404).json({ error: "Help request not found." });
    if (helpRequest.payment_type !== "pay_it_forward") {
      return res.status(400).json({ error: "This request does not have a pay-it-forward pledge." });
    }
    if (helpRequest.pledge_status === "repaid") {
      return res.status(409).json({ error: "This pledge was already fully repaid by the requester." });
    }
    if (helpRequest.pledge_status === "forgiven" || helpRequest.pledge_status === "written_off") {
      return res.status(409).json({ error: `Pledge is already resolved (status: ${helpRequest.pledge_status}).` });
    }
    // Allow subsidizing 'active' (early support) or 'defaulted' pledges
    if (helpRequest.pledge_status !== "active" && helpRequest.pledge_status !== "defaulted") {
      return res.status(400).json({ error: `Cannot subsidize a pledge with status '${helpRequest.pledge_status}'.` });
    }

    // Amount defaults to the outstanding balance if not provided
    const outstanding = (helpRequest.pledge_amount ?? 0) - (helpRequest.pledge_paid ?? 0);
    const amount = typeof rawAmount === "number" && rawAmount > 0
      ? rawAmount
      : (outstanding > 0 ? outstanding : 0);
    if (amount <= 0) {
      return res.status(400).json({ error: "amount must be a positive number (dollars) or the pledge must have an outstanding balance." });
    }

    // Mark pledge as forgiven + restore trust_score in one transaction
    await db.transaction(async (tx) => {
      await tx
        .update(requestsTable)
        .set({ pledge_status: "forgiven" })
        .where(eq(requestsTable.id, requestId));

      // Partial trust_score restoration — county co-signing shows community support
      await tx
        .update(usersTable)
        .set({ trust_score: sql`LEAST(100, COALESCE(${usersTable.trust_score}, 5) + 5)` })
        .where(eq(usersTable.id, helpRequest.requester_id));
    });

    // Record pool contribution and backfill pending helpers
    const notes = customNotes || `County pledge subsidy — ${sponsor.entity_name} (Gov Sponsor #${sponsorId}) co-signed request #${requestId}`;
    const recorded = await recordPoolContribution({
      amount,
      userId: req.authenticatedUserId!,
      notes,
      governmentSponsorId: sponsorId,
    });

    if (recorded) {
      await processPendingMinimums().catch((err: unknown) => {
        logger.error({ err }, "gov-sponsor subsidize-pledge: processPendingMinimums failed (non-fatal)");
      });
      const newBalance = await getPoolBalance();
      broadcast({ type: "pool_updated", payload: { balance: newBalance } });
    }

    logger.info(
      { gov_sponsor_id: sponsorId, request_id: requestId, requester_id: helpRequest.requester_id, amount, entity: sponsor.entity_name },
      "gov-sponsor: county pledge subsidy applied — pledge forgiven, trust_score +5",
    );

    return res.status(200).json({
      gov_sponsor_id: sponsorId,
      entity_name: sponsor.entity_name,
      request_id: requestId,
      requester_id: helpRequest.requester_id,
      amount_subsidized: amount,
      pledge_status: "forgiven",
      trust_score_delta: 5,
    });
  },
);

// ── PATCH /admin/gov-sponsors/:id/approve — approve or reject ────────────────
router.patch(
  "/admin/gov-sponsors/:id/approve",
  requireAuth,
  requireAdmin(),
  adminLimiter,
  async (req, res) => {
    const reviewerId = req.authenticatedUserId!;
    const sponsorId = parseInt(req.params.id as string, 10);
    if (isNaN(sponsorId)) return res.status(400).json({ error: "Invalid id" });

    const { approval_status, admin_notes } = req.body as {
      approval_status?: string;
      admin_notes?: string;
    };

    if (approval_status !== "approved" && approval_status !== "rejected") {
      return res
        .status(400)
        .json({ error: "approval_status must be 'approved' or 'rejected'." });
    }

    const [updated] = await db
      .update(governmentSponsorsTable)
      .set({
        approval_status,
        admin_notes: admin_notes?.trim() ?? null,
        reviewed_at: new Date(),
        reviewed_by_user_id: reviewerId,
        updated_at: new Date(),
      })
      .where(eq(governmentSponsorsTable.id, sponsorId))
      .returning();

    if (!updated) return res.status(404).json({ error: "Application not found." });

    logger.info(
      { gov_sponsor_id: sponsorId, approval_status, reviewer: reviewerId },
      "gov-sponsor: application reviewed",
    );
    return res.json(updated);
  },
);

export default router;
