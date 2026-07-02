/**
 * Government / County Sponsor Routes
 *
 * Endpoints for county and government entities to apply as named community pool
 * sponsors. Follows the same approval-queue pattern as businesses.ts.
 *
 * POST   /gov-sponsors              — submit an application (authenticated user)
 * GET    /gov-sponsors/mine         — list my own applications
 * GET    /admin/gov-sponsors        — list all (admin only)
 * PATCH  /admin/gov-sponsors/:id/approve — approve or reject (admin only)
 */
import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { db, governmentSponsorsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { adminLimiter, generalApiLimiter } from "../middlewares/rate-limit";

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
