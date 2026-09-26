import { Router } from "express";
import {
  db,
  reportsTable,
  usersTable,
  griotStoriesTable,
  exchangeListingsTable,
  exchangeModerationReviewHistoryTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { createMessageNotification } from "../lib/message-notifications";

const router = Router();
const sellerUsersTable = alias(usersTable, "seller");

const CreateReportBody = z.object({
  reporter_id: z.number().int().positive(),
  reported_user_id: z.number().int().positive().optional(),
  reported_request_id: z.number().int().positive().optional(),
  reported_griot_story_id: z.number().int().positive().optional(),
  type: z.enum([
    "suspicious_request",
    "suspicious_helper",
    "fraud",
    "harassment",
    "fake_profile",
    "dangerous_behavior",
    "spam",
    "other", "sos"]),
  description: z.string().min(10).max(2000),
}).refine(d => d.reported_user_id || d.reported_request_id || d.reported_griot_story_id, {
  message: "Must specify one of reported_user_id, reported_request_id, or reported_griot_story_id",
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

  const { reporter_id, reported_user_id, reported_request_id, reported_griot_story_id, type, description } = parsed.data;

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
      reported_griot_story_id: reported_griot_story_id ?? null,
      type,
      description,
      status: "pending",
    })
    .returning();

  logger.info(
    { report_id: report.id, reporter_id, type, reported_user_id, reported_request_id, reported_griot_story_id },
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
router.get("/reports", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
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

// ── GET /reports/griot-stories — admin: reports filed against Griot stories,
// enriched with story + author details so they can be moderated from a single
// dedicated queue instead of the generic reports list ────────────────────────
// NOTE: this must be registered BEFORE /reports/:id — otherwise Express
// matches "griot-stories" as the :id param and this route is unreachable.
router.get("/reports/griot-stories", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const status = req.query.status as string | undefined;
  const validStatuses = ["pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
  const validStatus = status && validStatuses.includes(status) ? status : undefined;

  const rows = await db
    .select({
      id: reportsTable.id,
      reporter_id: reportsTable.reporter_id,
      reported_griot_story_id: reportsTable.reported_griot_story_id,
      type: reportsTable.type,
      description: reportsTable.description,
      status: reportsTable.status,
      admin_notes: reportsTable.admin_notes,
      reviewed_by: reportsTable.reviewed_by,
      reviewed_at: reportsTable.reviewed_at,
      created_at: reportsTable.created_at,
      reporter_name: usersTable.name,
      reporter_email: usersTable.email,
      story_title: griotStoriesTable.title,
      story_text_content: griotStoriesTable.text_content,
      story_status: griotStoriesTable.status,
      story_visibility: griotStoriesTable.visibility,
      story_diaspora_tag: griotStoriesTable.diaspora_tag,
      story_author_id: griotStoriesTable.author_id,
      story_created_at: griotStoriesTable.created_at,
    })
    .from(reportsTable)
    // leftJoin, not innerJoin: if the reported story was deleted after the report
    // was filed, an innerJoin would silently drop the report itself from this
    // admin queue — the report (and its reporter) must stay visible either way.
    .leftJoin(griotStoriesTable, eq(reportsTable.reported_griot_story_id, griotStoriesTable.id))
    .leftJoin(usersTable, eq(reportsTable.reporter_id, usersTable.id))
    .where(
      and(
        sql`${reportsTable.reported_griot_story_id} IS NOT NULL`,
        validStatus ? eq(reportsTable.status, validStatus as "pending" | "under_review" | "resolved_dismissed" | "resolved_warned" | "resolved_banned") : undefined,
      )
    )
    .orderBy(desc(reportsTable.created_at))
    .limit(200);

  // Enrich with story author names in a single follow-up query.
  // story_author_id can be null (data-loss fix: griot_stories.author_id is
  // now "set null" if the author's account was deleted) — filter those out
  // before the inArray lookup rather than querying with a null in the list.
  const authorIds = [...new Set(rows.map(r => r.story_author_id).filter((id): id is number => id != null))];
  const authors = authorIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, authorIds))
    : [];
  const authorMap = new Map(authors.map(a => [a.id, a.name]));

  return res.json(rows.map(r => ({ ...r, story_author_name: r.story_author_id != null ? (authorMap.get(r.story_author_id) ?? null) : null })));
});

// ── GET /reports/exchange — admin: dedicated Exchange safety queue ───────────
// This remains separate from generic reports so moderators can see the listing
// lifecycle, current hold state, and the number of independent open reports.
router.get("/reports/exchange", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const status = req.query.status as string | undefined;
  const validStatuses = ["pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
  const validStatus = status && validStatuses.includes(status) ? status : undefined;
  const rows = await db.select({
    id: reportsTable.id,
    reporter_id: reportsTable.reporter_id,
    reported_user_id: reportsTable.reported_user_id,
    reported_exchange_listing_id: reportsTable.reported_exchange_listing_id,
    type: reportsTable.type,
    description: reportsTable.description,
    status: reportsTable.status,
    admin_notes: reportsTable.admin_notes,
    reviewed_by: reportsTable.reviewed_by,
    reviewed_at: reportsTable.reviewed_at,
    created_at: reportsTable.created_at,
    updated_at: reportsTable.updated_at,
    reporter_name: usersTable.name,
    reporter_email: usersTable.email,
    seller_name: sellerUsersTable.name,
    listing_title: exchangeListingsTable.title,
    listing_description: exchangeListingsTable.description,
    listing_type: exchangeListingsTable.listing_type,
    resource_type: exchangeListingsTable.resource_type,
    listing_category: exchangeListingsTable.category,
    listing_status: exchangeListingsTable.status,
    listing_moderation_status: exchangeListingsTable.moderation_status,
    listing_moderation_reason: exchangeListingsTable.moderation_reason,
    listing_hold_at: exchangeListingsTable.moderation_hold_at,
    listing_hold_reason: exchangeListingsTable.moderation_hold_reason,
    open_report_count: sql<number>`(
      SELECT COUNT(*)::int FROM reports open_report
      WHERE open_report.reported_exchange_listing_id = ${reportsTable.reported_exchange_listing_id}
        AND open_report.status IN ('pending', 'under_review')
    )`,
  })
    .from(reportsTable)
    .innerJoin(exchangeListingsTable, eq(reportsTable.reported_exchange_listing_id, exchangeListingsTable.id))
    .leftJoin(usersTable, eq(reportsTable.reporter_id, usersTable.id))
    .innerJoin(sellerUsersTable, eq(sellerUsersTable.id, exchangeListingsTable.seller_id))
    .where(and(
      isNotNull(reportsTable.reported_exchange_listing_id),
      validStatus ? eq(reportsTable.status, validStatus as "pending" | "under_review" | "resolved_dismissed" | "resolved_warned" | "resolved_banned") : undefined,
    ))
    .orderBy(desc(reportsTable.created_at))
    .limit(200);
  return res.json(rows);
});

// ── GET /reports/:id — admin: get a single report ─────────────────────────
router.get("/reports/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(String(req.params.id));
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
router.patch("/reports/:id/review", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
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

  // Exchange reports use a separate, durable moderation lifecycle. Raw report
  // counts never delete a post or suspend an account; only this authenticated
  // moderator action changes the listing and can contribute to repeat-violation
  // enforcement.
  if (updated.reported_exchange_listing_id) {
    const listingId = updated.reported_exchange_listing_id;
    const [listing] = await db.select({
      id: exchangeListingsTable.id,
      seller_id: exchangeListingsTable.seller_id,
      title: exchangeListingsTable.title,
      status: exchangeListingsTable.status,
      moderation_status: exchangeListingsTable.moderation_status,
    }).from(exchangeListingsTable).where(eq(exchangeListingsTable.id, listingId)).limit(1);

    if (listing) {
      const openReports = await db.select({ count: sql<number>`COUNT(*)::int` })
        .from(reportsTable)
        .where(and(
          eq(reportsTable.reported_exchange_listing_id, listingId),
          sql`${reportsTable.status} IN ('pending', 'under_review')`,
        ));
      const hasOpenReports = (openReports[0]?.count ?? 0) > 0;
      let nextModerationStatus = listing.moderation_status;
      let action = "reviewed";
      let listingStatus: string | undefined;
      let moderationReason: string | null | undefined;
      let holdAt: Date | null | undefined;
      let holdReason: string | null | undefined;

      if (status === "under_review") {
        nextModerationStatus = "held";
        action = "temporary_hold";
        moderationReason = "temporary_hold_for_moderator_review";
        holdAt = new Date();
        holdReason = "A moderator is reviewing an Exchange safety report.";
      } else if (status === "resolved_dismissed") {
        action = "dismissed";
        if (!hasOpenReports) {
          nextModerationStatus = "approved";
          moderationReason = null;
          holdAt = null;
          holdReason = null;
        }
      } else if (status === "resolved_warned") {
        action = "confirmed_warning";
        if (!hasOpenReports) {
          nextModerationStatus = "approved";
          moderationReason = null;
          holdAt = null;
          holdReason = null;
        } else {
          nextModerationStatus = "held";
          moderationReason = "additional_open_reports_require_review";
          holdAt = new Date();
          holdReason = "Additional reports remain open after a moderator warning.";
        }
      } else if (status === "resolved_banned") {
        action = "confirmed_violation";
        nextModerationStatus = "rejected";
        moderationReason = "confirmed_exchange_safety_violation";
        holdAt = new Date();
        holdReason = "Removed from public Exchange after moderator-confirmed violation.";
        // Keep reserved/completed coordination records intact. A listing with
        // no active handoff can be withdrawn from discovery without erasing
        // its historical row or pickup records.
        if (listing.status === "active") listingStatus = "withdrawn";
      }

      await db.transaction(async (tx) => {
        const listingUpdates: Record<string, unknown> = {
          moderation_status: nextModerationStatus,
          moderation_reason: moderationReason,
          moderation_reviewed_by: reviewed_by,
          moderation_reviewed_at: new Date(),
          moderation_hold_at: holdAt,
          moderation_hold_reason: holdReason,
        };
        if (listingStatus) {
          listingUpdates.status = listingStatus;
          listingUpdates.updated_at = new Date();
        }
        await tx.update(exchangeListingsTable)
          .set(listingUpdates as Partial<typeof exchangeListingsTable.$inferInsert>)
          .where(eq(exchangeListingsTable.id, listingId));
        await tx.insert(exchangeModerationReviewHistoryTable).values({
          report_id: updated.id,
          listing_id: listingId,
          moderator_id: reviewed_by,
          action,
          previous_moderation_status: listing.moderation_status,
          next_moderation_status: nextModerationStatus,
          notes: admin_notes ?? null,
        });
      });

      if (status === "resolved_banned") {
        const [confirmed] = await db.select({ count: sql<number>`COUNT(*)::int` })
          .from(reportsTable)
          .where(and(
            eq(reportsTable.reported_user_id, listing.seller_id),
            eq(reportsTable.status, "resolved_banned"),
            isNotNull(reportsTable.reported_exchange_listing_id),
          ));
        // Three moderator-confirmed Exchange violations suspend the account
        // through Niakofa's existing auth gate. Reports alone never count.
        if ((confirmed?.count ?? 0) >= 3) {
          await db.update(usersTable).set({
            is_suspended: true,
            suspended_at: new Date(),
            suspended_reason: "Three moderator-confirmed Exchange safety violations",
            helper_mode_active: false,
            token_version: sql`${usersTable.token_version} + 1`,
          }).where(eq(usersTable.id, listing.seller_id));
        }
      }

      const notice = status === "resolved_dismissed"
        ? "The safety team reviewed your Exchange post and dismissed the report."
        : status === "resolved_warned"
          ? "The safety team reviewed your Exchange post. Please keep Exchange non-commercial and safe for neighbors."
          : status === "resolved_banned"
            ? "The safety team removed your Exchange post after confirming a community safety violation."
            : "Your Exchange post is temporarily on hold while the safety team reviews it.";
      void createMessageNotification({
        userId: listing.seller_id,
        type: "exchange",
        title: "Exchange safety review update",
        body: notice,
        actionUrl: "/community?section=exchange&mine=true",
        metadata: { exchange_listing_id: listingId, report_id: updated.id, action },
      }).catch(() => {});
    }
  }

  // If a griot story report is upheld (resolved_banned), pull the story back
  // out of public view immediately — do not leave it live while banned.
  if (updated.reported_griot_story_id && status === "resolved_banned") {
    await db
      .update(griotStoriesTable)
      .set({ status: "pending_review", updated_at: new Date() })
      .where(eq(griotStoriesTable.id, updated.reported_griot_story_id));
    logger.info(
      { report_id: id, story_id: updated.reported_griot_story_id },
      "trust-safety: griot story pulled from public view after upheld report"
    );

    // Auto-dismiss any other still-open reports against the same story —
    // the action has already been taken (story removed), so duplicate
    // reports shouldn't linger in the pending queue awaiting separate review.
    const autoClosed = await db
      .update(reportsTable)
      .set({
        status: "resolved_dismissed",
        admin_notes: `Auto-dismissed: story already removed via report #${id}`,
        reviewed_by,
        reviewed_at: new Date(),
        updated_at: new Date(),
      })
      .where(
        and(
          eq(reportsTable.reported_griot_story_id, updated.reported_griot_story_id),
          sql`${reportsTable.status} IN ('pending', 'under_review')`,
          sql`${reportsTable.id} != ${id}`,
        )
      )
      .returning({ id: reportsTable.id });

    if (autoClosed.length > 0) {
      logger.info(
        { report_id: id, story_id: updated.reported_griot_story_id, auto_closed_ids: autoClosed.map(r => r.id) },
        "trust-safety: auto-dismissed duplicate open reports against banned story"
      );
      for (const r of autoClosed) {
        broadcast({
          type: "report_reviewed",
          payload: { id: r.id, status: "resolved_dismissed", reviewed_by },
        });
      }
    }
  }

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

// ── GET /users/:id/reports — admin: get all reports filed by or against a user
router.get("/users/:id/reports", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const userId = parseInt(String(req.params.id));
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
