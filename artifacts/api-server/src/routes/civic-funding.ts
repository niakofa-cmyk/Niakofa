/**
 * Approved municipal/county sponsor budget authorization and request funding.
 *
 * This is an auditable commitment ledger only. It does not receive or disburse
 * money and must not be presented as proof of cash movement.
 */
import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  governmentBudgetsTable,
  governmentRequestFundingTable,
  governmentSponsorsTable,
  requestsTable,
  usersTable,
  communitiesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";

const router = Router();
const MAX_BUDGET_CENTS = 100_000_000_00; // $100,000,000.00

type ApprovedSponsor = {
  id: number;
  entity_name: string;
  county: string;
  state: string;
  city: string | null;
};

function toCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents <= MAX_BUDGET_CENTS ? cents : null;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function asCents(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

async function approvedSponsorForUser(userId: number): Promise<ApprovedSponsor | null> {
  const [sponsor] = await db
    .select({
      id: governmentSponsorsTable.id,
      entity_name: governmentSponsorsTable.entity_name,
      county: governmentSponsorsTable.county,
      state: governmentSponsorsTable.state,
      city: governmentSponsorsTable.city,
    })
    .from(governmentSponsorsTable)
    .where(and(
      eq(governmentSponsorsTable.submitted_by_user_id, userId),
      eq(governmentSponsorsTable.approval_status, "approved"),
    ))
    .limit(1);
  return sponsor ?? null;
}

function requirePositiveId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/civic/funding/budgets", requireAuth, generalApiLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const rows = await db
    .select({
      id: governmentBudgetsTable.id,
      name: governmentBudgetsTable.name,
      fiscal_year: governmentBudgetsTable.fiscal_year,
      appropriation_reference: governmentBudgetsTable.appropriation_reference,
      authorized_amount: governmentBudgetsTable.authorized_amount,
      status: governmentBudgetsTable.status,
      created_at: governmentBudgetsTable.created_at,
      committed_amount: sql<string>`COALESCE(SUM(${governmentRequestFundingTable.amount}), 0)::text`,
    })
    .from(governmentBudgetsTable)
    .leftJoin(
      governmentRequestFundingTable,
      and(
        eq(governmentRequestFundingTable.budget_id, governmentBudgetsTable.id),
        eq(governmentRequestFundingTable.status, "approved"),
      ),
    )
    .where(eq(governmentBudgetsTable.government_sponsor_id, sponsor.id))
    .groupBy(governmentBudgetsTable.id)
    .orderBy(desc(governmentBudgetsTable.created_at));

  return res.json(rows.map((row) => {
    const authorized = asCents(row.authorized_amount);
    const committed = asCents(row.committed_amount);
    return {
      ...row,
      authorized_amount: dollars(authorized),
      committed_amount: dollars(committed),
      available_amount: dollars(row.status === "active" ? Math.max(0, authorized - committed) : 0),
    };
  }));
});

router.get("/civic/funding/report", requireAuth, generalApiLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const [budgets, allocations] = await Promise.all([
    db
      .select({
        id: governmentBudgetsTable.id,
        name: governmentBudgetsTable.name,
        fiscal_year: governmentBudgetsTable.fiscal_year,
        appropriation_reference: governmentBudgetsTable.appropriation_reference,
        authorized_amount: governmentBudgetsTable.authorized_amount,
        status: governmentBudgetsTable.status,
        created_at: governmentBudgetsTable.created_at,
      })
      .from(governmentBudgetsTable)
      .where(eq(governmentBudgetsTable.government_sponsor_id, sponsor.id))
      .orderBy(desc(governmentBudgetsTable.created_at)),
    db
      .select({
        id: governmentRequestFundingTable.id,
        budget_id: governmentRequestFundingTable.budget_id,
        budget_name: governmentBudgetsTable.name,
        fiscal_year: governmentBudgetsTable.fiscal_year,
        request_id: governmentRequestFundingTable.request_id,
        request_title: requestsTable.title,
        request_category: requestsTable.category,
        request_urgency: requestsTable.urgency,
        request_status: requestsTable.status,
        amount: governmentRequestFundingTable.amount,
        status: governmentRequestFundingTable.status,
        notes: governmentRequestFundingTable.notes,
        created_at: governmentRequestFundingTable.created_at,
      })
      .from(governmentRequestFundingTable)
      .innerJoin(
        governmentBudgetsTable,
        eq(governmentRequestFundingTable.budget_id, governmentBudgetsTable.id),
      )
      .innerJoin(requestsTable, eq(governmentRequestFundingTable.request_id, requestsTable.id))
      .where(eq(governmentRequestFundingTable.government_sponsor_id, sponsor.id))
      .orderBy(desc(governmentRequestFundingTable.created_at)),
  ]);

  const authorized = budgets.reduce((sum, budget) => sum + asCents(budget.authorized_amount), 0);
  const committed = allocations.reduce((sum, allocation) => sum + asCents(allocation.amount), 0);
  const activeAvailable = budgets
    .filter((budget) => budget.status === "active")
    .reduce((sum, budget) => sum + asCents(budget.authorized_amount), 0)
    - allocations
      .filter((allocation) => budgets.some((budget) => budget.id === allocation.budget_id && budget.status === "active"))
      .reduce((sum, allocation) => sum + asCents(allocation.amount), 0);
  const completedServiceValue = allocations
    .filter((allocation) => allocation.request_status === "completed")
    .reduce((sum, allocation) => sum + asCents(allocation.amount), 0);

  return res.json({
    summary: {
      authorized_amount: dollars(authorized),
      committed_amount: dollars(committed),
      available_amount: dollars(Math.max(0, activeAvailable)),
      completed_service_value: dollars(completedServiceValue),
    },
    allocations: allocations.map((allocation) => ({
      ...allocation,
      amount: dollars(asCents(allocation.amount)),
    })),
  });
});

router.post("/civic/funding/budgets", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await approvedSponsorForUser(userId);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const body = req.body as {
    name?: unknown;
    fiscal_year?: unknown;
    appropriation_reference?: unknown;
    authorized_amount?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const fiscalYearInput = typeof body.fiscal_year === "string" ? body.fiscal_year.trim() : "";
  const reference = typeof body.appropriation_reference === "string" ? body.appropriation_reference.trim() : "";
  const cents = toCents(body.authorized_amount);

  if (!name || name.length > 120) return res.status(400).json({ error: "Budget name is required and must be 120 characters or fewer." });
  const fiscalYearMatch = fiscalYearInput.match(/^(?:FY\s*)?(\d{4}(?:-\d{2})?)$/i);
  if (!fiscalYearMatch) return res.status(400).json({ error: "Fiscal year must be a year such as 2026 or FY 2026-27." });
  const fiscalYear = `FY ${fiscalYearMatch[1]}`;
  if (!reference || reference.length > 120) return res.status(400).json({ error: "Appropriation reference is required and must be 120 characters or fewer." });
  if (cents == null) return res.status(400).json({ error: "Authorized amount must be a positive amount with no more than two decimal places (up to $100,000,000)." });

  try {
    const [created] = await db
      .insert(governmentBudgetsTable)
      .values({
        government_sponsor_id: sponsor.id,
        name,
        fiscal_year: fiscalYear,
        appropriation_reference: reference,
        authorized_amount: dollars(cents),
        created_by_user_id: userId,
      })
      .returning();
    logger.info({ sponsor_id: sponsor.id, budget_id: created.id, fiscal_year: fiscalYear }, "civic funding: budget authorization recorded");
    return res.status(201).json({
      ...created,
      committed_amount: "0.00",
      available_amount: dollars(cents),
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "That appropriation reference is already registered for this fiscal year." });
    }
    throw err;
  }
});

router.patch("/civic/funding/budgets/:id/close", requireAuth, generalApiLimiter, async (req, res) => {
  const sponsor = await approvedSponsorForUser(req.authenticatedUserId!);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });
  const budgetId = requirePositiveId(req.params.id);
  if (budgetId == null) return res.status(400).json({ error: "Invalid budget id." });

  const [closed] = await db
    .update(governmentBudgetsTable)
    .set({ status: "closed", updated_at: new Date() })
    .where(and(
      eq(governmentBudgetsTable.id, budgetId),
      eq(governmentBudgetsTable.government_sponsor_id, sponsor.id),
      eq(governmentBudgetsTable.status, "active"),
    ))
    .returning();
  if (!closed) return res.status(409).json({ error: "Budget not found or already closed." });
  return res.json(closed);
});

router.post("/civic/funding/allocations", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const sponsor = await approvedSponsorForUser(userId);
  if (!sponsor) return res.status(403).json({ error: "An approved government sponsor account is required." });

  const body = req.body as { budget_id?: unknown; request_id?: unknown; amount?: unknown; notes?: unknown };
  const budgetId = requirePositiveId(body.budget_id);
  const requestId = requirePositiveId(body.request_id);
  const cents = toCents(body.amount);
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (budgetId == null || requestId == null) return res.status(400).json({ error: "Valid budget_id and request_id are required." });
  if (cents == null) return res.status(400).json({ error: "Allocation amount must be positive and have no more than two decimal places." });
  if (notes.length > 1000) return res.status(400).json({ error: "Notes must be 1,000 characters or fewer." });

  const [target] = await db
    .select({
      id: requestsTable.id,
      status: requestsTable.status,
      requester_id: requestsTable.requester_id,
      title: requestsTable.title,
      category: requestsTable.category,
      urgency: requestsTable.urgency,
    })
    .from(requestsTable)
    .where(eq(requestsTable.id, requestId))
    .limit(1);
  if (!target) return res.status(404).json({ error: "Community request not found." });
  if (target.status !== "open" && target.status !== "claimed") {
    return res.status(409).json({ error: "Only open or claimed community requests can receive a new public funding approval." });
  }

  const [requester] = await db
    .select({ county: communitiesTable.county, state: communitiesTable.state, city: usersTable.city })
    .from(usersTable)
    .innerJoin(communitiesTable, eq(usersTable.community_id, communitiesTable.id))
    .where(eq(usersTable.id, target.requester_id))
    .limit(1);
  const normalize = (value: string) => value.trim().replace(/\s+County$/i, "").toLocaleLowerCase();
  if (
    !requester
    || !requester.county
    || !requester.state
    || normalize(requester.county) !== normalize(sponsor.county)
    || requester.state.trim().toUpperCase() !== sponsor.state.trim().toUpperCase()
    || (sponsor.city != null && requester.city?.trim().toLocaleLowerCase() !== sponsor.city.trim().toLocaleLowerCase())
  ) {
    return res.status(404).json({ error: "Community request not found in your approved jurisdiction." });
  }

  try {
    const allocation = await db.transaction(async (tx) => {
      const [budget] = await tx
        .select({
          id: governmentBudgetsTable.id,
          name: governmentBudgetsTable.name,
          fiscal_year: governmentBudgetsTable.fiscal_year,
          authorized_amount: governmentBudgetsTable.authorized_amount,
          status: governmentBudgetsTable.status,
        })
        .from(governmentBudgetsTable)
        .where(and(
          eq(governmentBudgetsTable.id, budgetId),
          eq(governmentBudgetsTable.government_sponsor_id, sponsor.id),
        ))
        .for("update")
        .limit(1);
      if (!budget) return { ok: false as const, error: "Budget not found.", status: 404 as const };
      if (budget.status !== "active") return { ok: false as const, error: "This budget is closed.", status: 409 as const };

      const [lockedRequest] = await tx
        .select({
          id: requestsTable.id,
          title: requestsTable.title,
          category: requestsTable.category,
          urgency: requestsTable.urgency,
          status: requestsTable.status,
        })
        .from(requestsTable)
        .where(eq(requestsTable.id, requestId))
        .for("update")
        .limit(1);
      if (!lockedRequest) return { ok: false as const, error: "Community request not found.", status: 404 as const };
      if (lockedRequest.status !== "open" && lockedRequest.status !== "claimed") {
        return { ok: false as const, error: "Only open or claimed community requests can receive a new public funding approval.", status: 409 as const };
      }

      const [committedRow] = await tx
        .select({
          cents: sql<number>`COALESCE(ROUND(SUM(${governmentRequestFundingTable.amount}) * 100), 0)::int`,
        })
        .from(governmentRequestFundingTable)
        .where(and(
          eq(governmentRequestFundingTable.budget_id, budget.id),
          eq(governmentRequestFundingTable.status, "approved"),
        ));
      const remaining = asCents(budget.authorized_amount) - Number(committedRow?.cents ?? 0);
      if (cents > remaining) {
        return { ok: false as const, error: `Allocation exceeds the available authorization of $${dollars(Math.max(remaining, 0))}.`, status: 409 as const };
      }

      const [created] = await tx
        .insert(governmentRequestFundingTable)
        .values({
          government_sponsor_id: sponsor.id,
          budget_id: budget.id,
          request_id: lockedRequest.id,
          amount: dollars(cents),
          notes: notes || null,
          approved_by_user_id: userId,
        })
        .returning();
      return {
        ok: true as const,
        allocation: {
          ...created,
          budget_name: budget.name,
          fiscal_year: budget.fiscal_year,
          request_title: lockedRequest.title,
          request_category: lockedRequest.category,
          request_urgency: lockedRequest.urgency,
          request_status: lockedRequest.status,
          amount: dollars(cents),
        },
      };
    });
    if (!allocation.ok) return res.status(allocation.status).json({ error: allocation.error });

    logger.info({
      sponsor_id: sponsor.id,
      budget_id: budgetId,
      request_id: requestId,
      amount: dollars(cents),
      approved_by: userId,
    }, "civic funding: public budget commitment approved for community request");
    return res.status(201).json(allocation.allocation);
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return res.status(409).json({ error: "This sponsor already has a public funding approval for that request." });
    }
    throw err;
  }
});

export default router;
