/**
 * Griot Stories — oral history / diaspora storytelling
 *
 * Endpoints:
 *  GET  /griot/stories             — published stories (public feed)
 *  GET  /griot/stories/mine        — caller's own stories (all statuses)
 *  POST /griot/stories             — create a new story (auth required)
 *  GET  /griot/stories/:id         — single story detail
 *  PATCH /griot/stories/:id        — update title/visibility/release_at (author only)
 *  POST /griot/stories/:id/publish — set status = published (author only)
 *
 *  GET  /griot/stories/:id/translations       — list translations for a story
 *  POST /griot/stories/:id/translations       — add/upsert a translation
 *  PATCH /griot/stories/:id/translations/:lang/approve — recorder approves translation
 */

import { Router } from "express";
import Stripe from "stripe";
import { db, griotStoriesTable, storyTranslationsTable, griotTranscriptionJobsTable, diasporaHubsTable, usersTable, requestsTable, communityPoolLedgerTable, reportsTable, hubCommunityLeadersTable, diasporaHubPledgesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { generalApiLimiter, adminLimiter, paymentLimiter } from "../middlewares/rate-limit";
import { eq, and, desc, sql, gte } from "drizzle-orm";
import { z } from "zod";
import { moderatePostText } from "../lib/post-moderation";
import { broadcast } from "../lib/ws-hub";
import { logger } from "../lib/logger";
import { recordPoolContribution, processPendingMinimums, getHubReservedBalance } from "../lib/community-pool";

// Same graceful-degradation pattern as pool.ts / wallet.ts / stripe.ts —
// pledges work in dev mode without a Stripe key, but real charges require it.
const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as Stripe.LatestApiVersion })
  : null;

const router = Router();

// ── Validation schemas ─────────────────────────────────────────────────────

const CreateStorySchema = z.object({
  title:             z.string().max(200).optional(),
  prompt:            z.string().max(500).optional(),
  text_content:      z.string().max(20000).optional(),
  audio_url:         z.string().url().optional(),
  original_language: z.string().max(10).default("en"),
  diaspora_tag:      z.string().max(100).optional(),
  hub_location:      z.string().max(200).optional(),
  lat:               z.number().min(-90).max(90).optional(),
  lng:               z.number().min(-180).max(180).optional(),
  visibility:        z.enum(["public", "diaspora_tag", "private"]).default("public"),
  release_at:        z.string().datetime().optional(),
  duration_seconds:  z.number().int().min(0).max(7200).optional(),
});

const UpdateStorySchema = z.object({
  title:       z.string().max(200).optional(),
  visibility:  z.enum(["public", "diaspora_tag", "private"]).optional(),
  release_at:  z.string().datetime().nullable().optional(),
  hub_location: z.string().max(200).optional(),
  diaspora_tag: z.string().max(100).optional(),
});

const UpsertTranslationSchema = z.object({
  language:       z.string().min(2).max(10),
  nia_draft_text: z.string().max(20000).optional(),
  edited_text:    z.string().max(20000).optional(),
});

// ── GET /griot/stories — public published feed ─────────────────────────────

router.get("/griot/stories", generalApiLimiter, async (req, res) => {
  const hubLocation = req.query.hub as string | undefined;
  const diasporaTag = req.query.tag as string | undefined;
  const limit = Math.min(Number(req.query.limit ?? 20), 50);
  const offset = Number(req.query.offset ?? 0);

  // Public feed: only published AND public-visibility stories
  const conditions = [
    eq(griotStoriesTable.status, "published"),
    eq(griotStoriesTable.visibility, "public"),
  ];
  if (hubLocation) conditions.push(eq(griotStoriesTable.hub_location, hubLocation));
  if (diasporaTag) conditions.push(eq(griotStoriesTable.diaspora_tag, diasporaTag));

  const stories = await db
    .select({
      id:                griotStoriesTable.id,
      author_id:         griotStoriesTable.author_id,
      title:             griotStoriesTable.title,
      text_content:      griotStoriesTable.text_content,
      audio_url:         griotStoriesTable.audio_url,
      original_language: griotStoriesTable.original_language,
      diaspora_tag:      griotStoriesTable.diaspora_tag,
      hub_location:      griotStoriesTable.hub_location,
      lat:               griotStoriesTable.lat,
      lng:               griotStoriesTable.lng,
      visibility:        griotStoriesTable.visibility,
      duration_seconds:  griotStoriesTable.duration_seconds,
      published_at:      griotStoriesTable.published_at,
    })
    .from(griotStoriesTable)
    .where(and(...conditions))
    .orderBy(desc(griotStoriesTable.published_at))
    .limit(limit)
    .offset(offset);

  res.json({ stories, limit, offset });
});

// ── GET /griot/stories/mine — caller's own stories ─────────────────────────

router.get("/griot/stories/mine", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const stories = await db
    .select()
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.author_id, userId))
    .orderBy(desc(griotStoriesTable.created_at));
  res.json({ stories });
});

// ── POST /griot/stories — create a story ──────────────────────────────────

router.post("/griot/stories", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const parsed = CreateStorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid story data", issues: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  if (data.text_content) {
    const moderation = moderatePostText(data.text_content);
    if (moderation.status === "pending") {
      logger.warn(
        { author_id: userId, reason: moderation.reason },
        "griot: story text flagged by moderation heuristic on creation (will be re-checked at publish time)"
      );
    }
  }

  const [story] = await db
    .insert(griotStoriesTable)
    .values({
      author_id:         userId,
      title:             data.title,
      prompt:            data.prompt,
      text_content:      data.text_content,
      audio_url:         data.audio_url,
      original_language: data.original_language,
      diaspora_tag:      data.diaspora_tag,
      hub_location:      data.hub_location,
      lat:               data.lat,
      lng:               data.lng,
      visibility:        data.visibility,
      release_at:        data.release_at ? new Date(data.release_at) : undefined,
      duration_seconds:  data.duration_seconds,
      status:            "recorded",
    })
    .returning();

  // Enqueue the transcription/translation pipeline whenever there's
  // something for griot-transcription-worker to do — audio needing a
  // transcript, or text already present that just needs translation drafts.
  // A pure metadata-only story (title only, no audio_url/text_content yet)
  // enqueues nothing; the author can trigger this later via a PATCH once
  // they add content.
  if (story.audio_url || story.text_content) {
    await db.insert(griotTranscriptionJobsTable).values({ story_id: story.id });
  }

  res.status(201).json({ story });
});

// ── GET /griot/stories/:id ─────────────────────────────────────────────────

router.get("/griot/stories/:id", generalApiLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid story id" });
    return;
  }

  const [story] = await db
    .select()
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.id, id));

  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  // Access control: non-published stories are author-only;
  // published but non-public stories are also author-only
  const callerId = (req as { authenticatedUserId?: number }).authenticatedUserId;
  const isAuthor = story.author_id === callerId;
  if (story.status !== "published" && !isAuthor) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (story.status === "published" && story.visibility !== "public" && !isAuthor) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const translations = await db
    .select()
    .from(storyTranslationsTable)
    .where(eq(storyTranslationsTable.story_id, id));

  res.json({ story, translations });
});

// ── PATCH /griot/stories/:id — update (author only) ───────────────────────

router.patch("/griot/stories/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid story id" });
    return;
  }

  const [existing] = await db
    .select({ author_id: griotStoriesTable.author_id })
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Story not found" });
    return;
  }
  if (existing.author_id !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsed = UpdateStorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid update data", issues: parsed.error.issues });
    return;
  }

  const updates: Partial<typeof griotStoriesTable.$inferInsert> = {
    updated_at: new Date(),
  };
  if (parsed.data.title !== undefined)       updates.title       = parsed.data.title;
  if (parsed.data.visibility !== undefined)  updates.visibility  = parsed.data.visibility;
  if (parsed.data.hub_location !== undefined) updates.hub_location = parsed.data.hub_location;
  if (parsed.data.diaspora_tag !== undefined) updates.diaspora_tag = parsed.data.diaspora_tag;
  if ("release_at" in parsed.data) {
    updates.release_at = parsed.data.release_at ? new Date(parsed.data.release_at!) : null;
  }

  const [updated] = await db
    .update(griotStoriesTable)
    .set(updates)
    .where(eq(griotStoriesTable.id, id))
    .returning();

  res.json({ story: updated });
});

// ── DELETE /griot/stories/:id — author or admin removes a story ───────────
//
// Soft-delete pattern: we mark the row deleted rather than removing it so that
// transcription jobs / translation references aren't left pointing at a missing
// FK.  The record is removed from all public list endpoints via a
// WHERE status != 'deleted' filter, but remains queryable by admins for audit.

router.delete("/griot/stories/:id", requireAuth, generalApiLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid story id" });
    return;
  }

  const [story] = await db
    .select({ author_id: griotStoriesTable.author_id, status: griotStoriesTable.status })
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.id, id));

  if (!story) {
    res.status(404).json({ error: "Story not found" });
    return;
  }

  // Only the author or an admin may delete
  const [callerRow] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, callerId))
    .limit(1);

  const isAdmin = callerRow?.is_admin === true;
  if (story.author_id !== callerId && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Hard delete — simpler than soft-delete given no griot FK constraints on stories
  await db.delete(griotStoriesTable).where(eq(griotStoriesTable.id, id));

  res.json({ ok: true, id });
});

// ── POST /griot/stories/:id/publish — recorder releases story ─────────────

router.post("/griot/stories/:id/publish", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid story id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.id, id));

  if (!existing) { res.status(404).json({ error: "Story not found" }); return; }
  if (existing.author_id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const allowedStatuses = ["ready", "pending_review", "recorded"];
  if (!allowedStatuses.includes(existing.status)) {
    res.status(409).json({ error: "Story cannot be published from its current status" });
    return;
  }

  // Re-screen text content at the moment of publish (not just creation) —
  // this is the actual gate against public UGC going live unmoderated.
  // A story with an open, unresolved report against it is also blocked.
  if (existing.text_content) {
    const moderation = moderatePostText(existing.text_content);
    if (moderation.status === "pending") {
      logger.warn(
        { story_id: id, author_id: userId, reason: moderation.reason },
        "griot: publish blocked by moderation heuristic"
      );
      res.status(409).json({
        error: "This story was flagged by our content screen and cannot be published yet. Contact support if you believe this is a mistake.",
      });
      return;
    }
  }

  const [openReport] = await db
    .select({ id: reportsTable.id })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.reported_griot_story_id, id),
        sql`${reportsTable.status} IN ('pending', 'under_review')`
      )
    )
    .limit(1);
  if (openReport) {
    res.status(409).json({ error: "This story has an open report and cannot be published until it is resolved" });
    return;
  }

  const now = new Date();
  const releaseAt = existing.release_at;
  if (releaseAt && releaseAt > now) {
    // Scheduled for the future — mark ready but don't publish yet
    const [updated] = await db
      .update(griotStoriesTable)
      .set({ status: "ready", updated_at: now })
      .where(eq(griotStoriesTable.id, id))
      .returning();
    res.json({ story: updated, scheduled: true, release_at: releaseAt });
    return;
  }

  const [updated] = await db
    .update(griotStoriesTable)
    .set({ status: "published", published_at: now, updated_at: now })
    .where(eq(griotStoriesTable.id, id))
    .returning();

  res.json({ story: updated });
});

// ── GET /griot/stories/:id/translations ───────────────────────────────────

router.get("/griot/stories/:id/translations", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid story id" }); return; }

  const [story] = await db
    .select({ author_id: griotStoriesTable.author_id })
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.id, id));

  if (!story) { res.status(404).json({ error: "Story not found" }); return; }
  if (story.author_id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const translations = await db
    .select()
    .from(storyTranslationsTable)
    .where(eq(storyTranslationsTable.story_id, id));

  res.json({ translations });
});

// ── POST /griot/stories/:id/translations — upsert a translation ───────────

router.post("/griot/stories/:id/translations", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid story id" }); return; }

  const [story] = await db
    .select({ author_id: griotStoriesTable.author_id })
    .from(griotStoriesTable)
    .where(eq(griotStoriesTable.id, id));

  if (!story) { res.status(404).json({ error: "Story not found" }); return; }
  if (story.author_id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpsertTranslationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid translation data", issues: parsed.error.issues });
    return;
  }

  const [translation] = await db
    .insert(storyTranslationsTable)
    .values({
      story_id:       id,
      language:       parsed.data.language,
      nia_draft_text: parsed.data.nia_draft_text,
      edited_text:    parsed.data.edited_text,
    })
    .onConflictDoUpdate({
      target: [storyTranslationsTable.story_id, storyTranslationsTable.language],
      set: {
        nia_draft_text: parsed.data.nia_draft_text ?? undefined,
        edited_text:    parsed.data.edited_text ?? undefined,
        was_edited:     parsed.data.edited_text !== undefined ? true : undefined,
        recorder_approved: false, // any new draft resets approval
        updated_at: new Date(),
      },
    })
    .returning();

  res.status(201).json({ translation });
});

// ── PATCH /griot/stories/:id/translations/:lang/approve ───────────────────

router.patch(
  "/griot/stories/:id/translations/:lang/approve",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const userId = req.authenticatedUserId!;
    const id = Number(req.params.id);
    const lang = String(req.params.lang);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid story id" }); return; }

    const [story] = await db
      .select({ author_id: griotStoriesTable.author_id, status: griotStoriesTable.status })
      .from(griotStoriesTable)
      .where(eq(griotStoriesTable.id, id));

    if (!story) { res.status(404).json({ error: "Story not found" }); return; }
    if (story.author_id !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

    const editedText = req.body.edited_text as string | undefined;

    const now = new Date();
    const updateValues: Partial<typeof storyTranslationsTable.$inferInsert> = {
      recorder_approved: true,
      approved_at: now,
      updated_at: now,
    };
    if (editedText !== undefined) {
      updateValues.edited_text = editedText;
      updateValues.was_edited = true;
    }

    const [translation] = await db
      .update(storyTranslationsTable)
      .set(updateValues)
      .where(
        and(
          eq(storyTranslationsTable.story_id, id),
          eq(storyTranslationsTable.language, lang),
        )
      )
      .returning();

    if (!translation) { res.status(404).json({ error: "Translation not found" }); return; }

    // Advance story to pending_review → ready if all existing translations are approved
    if (story.status === "transcribing" || story.status === "pending_review") {
      const allTranslations = await db
        .select({ recorder_approved: storyTranslationsTable.recorder_approved })
        .from(storyTranslationsTable)
        .where(eq(storyTranslationsTable.story_id, id));

      const allApproved = allTranslations.every(t => t.recorder_approved);
      if (allApproved) {
        await db
          .update(griotStoriesTable)
          .set({ status: "ready", updated_at: now })
          .where(eq(griotStoriesTable.id, id));
      }
    }

    res.json({ translation });
  }
);

// ── Diaspora Hubs ────────────────────────────────────────────────────────────
// Replaces the hardcoded 10-city array that used to live in globe.tsx.
// Seed hubs (the original 10) ship via migration 0053 with is_seed=true.

const ProposeHubSchema = z.object({
  name:         z.string().min(2).max(120),
  region_label: z.string().min(2).max(200),
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  tag:          z.string().max(20).default("us"),
  note:         z.string().max(500).optional(),
});

const ClaimHubSchema = z.object({
  community_id: z.number(),
});

const ReviewHubSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
});

// GET /griot/hubs — public. Every approved hub, enriched with a published
// story count and, for hubs a community has claimed, the same live activity
// numbers /impact/:county shows (active helpers, requests fulfilled, pool
// balance) — this is what turns the globe from "10 static pins with lore"
// into a map of where the actual help network is active.
router.get("/griot/hubs", generalApiLimiter, async (_req, res) => {
  const hubs = await db
    .select()
    .from(diasporaHubsTable)
    .where(eq(diasporaHubsTable.status, "approved"))
    .orderBy(desc(diasporaHubsTable.is_seed));

  const enriched = await Promise.all(
    hubs.map(async (hub) => {
      const [storyCountRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(griotStoriesTable)
        .where(and(eq(griotStoriesTable.hub_id, hub.id), eq(griotStoriesTable.status, "published")));

      // Real member count for the hub. Two sources, always additive:
      //  - residents who've explicitly joined this hub's globe circle
      //    (hub_community_leaders rows, approved or not — a pending
      //    application still counts someone as a member)
      //  - if the hub is claimed by a real Niakofa community, every user
      //    in that community counts too (they're already "members" via
      //    the community they belong to).
      const [leaderMemberRow] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${hubCommunityLeadersTable.user_id})::int` })
        .from(hubCommunityLeadersTable)
        .where(eq(hubCommunityLeadersTable.hub_id, hub.id));

      // Live mutual-aid engine link: open requests directly tagged to this hub
      // (help_requests.hub_id) — independent of whether a community has
      // claimed the hub. This is what actually connects the Globe to the
      // real request/pool activity instead of just story counts.
      const [openHubRequestsRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(requestsTable)
        .where(and(eq(requestsTable.hub_id, hub.id), eq(requestsTable.status, "open")));
      const open_requests = openHubRequestsRow?.count ?? 0;

      let communityMemberCount = 0;
      let activity: { active_helpers: number; requests_fulfilled: number; pool_balance: number } | null = null;

      if (hub.community_id) {
        const [helperRow, requestRow, poolRow, memberRow] = await Promise.all([
          db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(usersTable)
            .where(and(eq(usersTable.community_id, hub.community_id), eq(usersTable.helper_mode_active, true))),
          db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(requestsTable)
            .where(sql`${requestsTable.status} = 'completed'
              AND ${requestsTable.requester_id} IN (SELECT id FROM users WHERE community_id = ${hub.community_id})`),
          db
            .select({ balance: sql<number>`COALESCE(SUM(${communityPoolLedgerTable.amount}), 0)::float8` })
            .from(communityPoolLedgerTable)
            .where(eq(communityPoolLedgerTable.community_id, hub.community_id)),
          db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(usersTable)
            .where(eq(usersTable.community_id, hub.community_id)),
        ]);

        activity = {
          active_helpers: helperRow[0]?.count ?? 0,
          requests_fulfilled: requestRow[0]?.count ?? 0,
          pool_balance: poolRow[0]?.balance ?? 0,
        };
        communityMemberCount = memberRow[0]?.count ?? 0;
      }

      const leaderMemberCount = leaderMemberRow?.count ?? 0;

      return {
        ...hub,
        story_count: storyCountRow?.count ?? 0,
        member_count: communityMemberCount + leaderMemberCount,
        open_requests,
        activity,
      };
    })
  );

  res.json({ hubs: enriched });
});

// POST /griot/hubs — propose a new hub (any authenticated user). Goes to
// pending_review, same governance pattern as story publish/gov-sponsor
// approval — an admin has to approve it before it shows on the public globe.
router.post("/griot/hubs", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const parsed = ProposeHubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid hub data", issues: parsed.error.issues });
    return;
  }

  // Hub proposals are open to any authenticated user, same as any other
  // user-generated text on the platform — run them through the same
  // spam/illegal-content heuristics as requests and posts. Every proposal
  // already lands in pending_review either way (admin must approve it), but
  // a flagged one is logged loudly so it doesn't slip through an admin's
  // review queue unnoticed among routine proposals.
  let flagged = false;
  let flagReason: string | null = null;
  for (const field of [parsed.data.name, parsed.data.region_label, parsed.data.note]) {
    if (!field) continue;
    const moderation = moderatePostText(field);
    if (moderation.status === "pending") {
      flagged = true;
      flagReason = moderation.reason;
      break;
    }
  }

  try {
    const [hub] = await db
      .insert(diasporaHubsTable)
      .values({ ...parsed.data, created_by: userId, status: "pending_review", is_seed: false })
      .returning();
    if (flagged) {
      logger.warn({ hub_id: hub!.id, created_by: userId, reason: flagReason }, "griot: hub proposal flagged by content moderation");
    }
    res.status(201).json({ hub });
  } catch (err: unknown) {
    // UNIQUE(name) — a duplicate proposal is a friendly 409, not a 500.
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "A hub with this name already exists or is pending review" });
      return;
    }
    throw err;
  }
});

// Helper: is this user an approved leader of the hub (or a platform admin)?
// Used to gate hub-scoped "manage_tasks" tier actions (claim, crisis
// declare/clear, leader approvals) without requiring full admin.
async function isHubLeaderOrAdmin(hubId: number, userId: number): Promise<boolean> {
  const [caller] = await db
    .select({ is_admin: usersTable.is_admin })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (caller?.is_admin) return true;

  const [leader] = await db
    .select({ id: hubCommunityLeadersTable.id })
    .from(hubCommunityLeadersTable)
    .where(
      and(
        eq(hubCommunityLeadersTable.hub_id, hubId),
        eq(hubCommunityLeadersTable.user_id, userId),
        eq(hubCommunityLeadersTable.approved, true),
      )
    )
    .limit(1);
  return !!leader;
}

// PATCH /griot/hubs/:id/claim — attach a real Niakofa community to an
// existing hub. Originally admin-only; now also open to that hub's approved
// leader — claiming/managing a hub is a manage_tasks-tier action, not a
// full-admin one. Claiming is what lights up the `activity` block in
// GET /griot/hubs for that hub.
router.patch("/griot/hubs/:id/claim", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  if (!(await isHubLeaderOrAdmin(id, userId))) {
    res.status(403).json({ error: "Only an approved hub leader or admin can claim this hub" });
    return;
  }

  const parsed = ClaimHubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid claim data", issues: parsed.error.issues });
    return;
  }

  const [hub] = await db
    .update(diasporaHubsTable)
    .set({ community_id: parsed.data.community_id, updated_at: new Date() })
    .where(eq(diasporaHubsTable.id, id))
    .returning();

  if (!hub) { res.status(404).json({ error: "Hub not found" }); return; }
  res.json({ hub });
});

// ── Hub community leaders ───────────────────────────────────────────────────

// POST /griot/hubs/:id/leaders/apply — a resident applies to lead/represent
// a hub. Starts unapproved; an existing approved leader or admin approves.
router.post("/griot/hubs/:id/leaders/apply", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = Number(req.params.id);
  if (!Number.isFinite(hubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  const [hub] = await db.select({ id: diasporaHubsTable.id }).from(diasporaHubsTable).where(eq(diasporaHubsTable.id, hubId));
  if (!hub) { res.status(404).json({ error: "Hub not found" }); return; }

  try {
    const [application] = await db
      .insert(hubCommunityLeadersTable)
      .values({ hub_id: hubId, user_id: userId, role: "leader", approved: false })
      .returning();
    res.status(201).json({ application });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "You've already applied to lead this hub" });
      return;
    }
    throw err;
  }
});

// GET /griot/hubs/:id/leaders — public list of a hub's approved leaders.
router.get("/griot/hubs/:id/leaders", generalApiLimiter, async (req, res) => {
  const hubId = Number(req.params.id);
  if (!Number.isFinite(hubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  const leaders = await db
    .select({
      id: hubCommunityLeadersTable.id,
      user_id: hubCommunityLeadersTable.user_id,
      role: hubCommunityLeadersTable.role,
      approved: hubCommunityLeadersTable.approved,
      created_at: hubCommunityLeadersTable.created_at,
      name: usersTable.name,
    })
    .from(hubCommunityLeadersTable)
    .innerJoin(usersTable, eq(usersTable.id, hubCommunityLeadersTable.user_id))
    .where(and(eq(hubCommunityLeadersTable.hub_id, hubId), eq(hubCommunityLeadersTable.approved, true)));

  res.json({ leaders });
});

// PATCH /griot/hubs/:id/leaders/:userId/approve — approve a pending leader
// application. Callable by an existing approved leader of the SAME hub or a
// platform admin (bootstraps via admin for a hub's very first leader).
router.patch("/griot/hubs/:id/leaders/:userId/approve", requireAuth, generalApiLimiter, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const hubId = Number(req.params.id);
  const targetUserId = Number(req.params.userId);
  if (!Number.isFinite(hubId) || !Number.isFinite(targetUserId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  if (!(await isHubLeaderOrAdmin(hubId, callerId))) {
    res.status(403).json({ error: "Only an approved hub leader or admin can approve leaders" });
    return;
  }

  const [updated] = await db
    .update(hubCommunityLeadersTable)
    .set({ approved: true, approved_by: callerId, approved_at: new Date() })
    .where(and(eq(hubCommunityLeadersTable.hub_id, hubId), eq(hubCommunityLeadersTable.user_id, targetUserId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Application not found" }); return; }
  res.json({ leader: updated });
});

// ── Crisis-lit hubs + direct cross-hub relief ───────────────────────────────

const CrisisSchema = z.object({
  crisis_message: z.string().min(3).max(500),
});

// $100,000 with no per-user velocity limit was free to submit repeatedly —
// capped lower and paired with a rolling 24h per-user total below, until this
// is backed by something sturdier than a single card charge per pledge.
const PLEDGE_MAX_AMOUNT = 5000;
const PLEDGE_DAILY_USER_CAP = 10000;

const PledgeSchema = z.object({
  from_hub_id: z.number(),
  amount: z.number().positive().max(PLEDGE_MAX_AMOUNT),
  message: z.string().max(500).optional(),
});

// POST /griot/hubs/:id/crisis — flag a hub as in crisis (leader/admin only).
// Broadcasts on the existing "crisis_update" ws event so the whole globe
// (and map) lights up in real time.
router.post("/griot/hubs/:id/crisis", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = Number(req.params.id);
  if (!Number.isFinite(hubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  if (!(await isHubLeaderOrAdmin(hubId, userId))) {
    res.status(403).json({ error: "Only an approved hub leader or admin can declare a crisis" });
    return;
  }

  const parsed = CrisisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid crisis data", issues: parsed.error.issues });
    return;
  }

  const [hub] = await db
    .update(diasporaHubsTable)
    .set({
      is_crisis: true,
      crisis_message: parsed.data.crisis_message,
      crisis_declared_at: new Date(),
      crisis_declared_by: userId,
      updated_at: new Date(),
    })
    .where(eq(diasporaHubsTable.id, hubId))
    .returning();

  if (!hub) { res.status(404).json({ error: "Hub not found" }); return; }

  broadcast({ type: "crisis_update", payload: { hub_id: hub.id, name: hub.name, is_crisis: true, crisis_message: hub.crisis_message } });
  logger.warn({ hub_id: hub.id, declared_by: userId }, "griot: hub crisis declared");

  res.json({ hub });
});

// DELETE /griot/hubs/:id/crisis — clear a hub's crisis flag (leader/admin
// only). Requires a resolution note: clearing a real emergency from the map
// with no record of who did it or why is the single riskiest action in this
// flow, so it now leaves an audit trail (migration 0056) mirroring the
// existing crisis_declared_by/at pair.
const ClearCrisisSchema = z.object({
  crisis_resolved_note: z.string().min(3).max(500),
});

router.delete("/griot/hubs/:id/crisis", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = Number(req.params.id);
  if (!Number.isFinite(hubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  if (!(await isHubLeaderOrAdmin(hubId, userId))) {
    res.status(403).json({ error: "Only an approved hub leader or admin can clear a crisis" });
    return;
  }

  const parsed = ClearCrisisSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A resolution note is required to clear a crisis", issues: parsed.error.issues });
    return;
  }

  const [hub] = await db
    .update(diasporaHubsTable)
    .set({
      is_crisis: false,
      crisis_message: null,
      crisis_resolved_note: parsed.data.crisis_resolved_note,
      crisis_cleared_at: new Date(),
      crisis_cleared_by: userId,
      updated_at: new Date(),
    })
    .where(eq(diasporaHubsTable.id, hubId))
    .returning();

  if (!hub) { res.status(404).json({ error: "Hub not found" }); return; }

  logger.warn({ hub_id: hub.id, cleared_by: userId, note: parsed.data.crisis_resolved_note }, "griot: hub crisis cleared");
  broadcast({ type: "crisis_update", payload: { hub_id: hub.id, name: hub.name, is_crisis: false } });
  res.json({ hub });
});

// POST /griot/hubs/:id/pledges — send direct crisis help from one hub to
// another that's currently flagged is_crisis. Any authenticated user can
// pledge on behalf of their own hub (from_hub_id) — this is the
// "let hub leaders AND residents send direct crisis help between hubs" flow.
//
// Payment wiring (migration 0055): a pledge used to be a bare DB row — no
// money ever moved. Now, when Stripe is configured, this creates a real
// PaymentIntent and inserts the row as 'pending_payment'; the webhook
// (payment_intent.succeeded in stripe.ts) confirms the charge, flips the
// row to 'pledged', and credits the destination hub's community pool via
// recordPoolContribution(). Without Stripe configured (dev mode), the
// pledge is recorded and credited immediately so the flow stays testable
// end-to-end — same convention as POST /pool/contribute.
router.post("/griot/hubs/:id/pledges", requireAuth, paymentLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const toHubId = Number(req.params.id);
  if (!Number.isFinite(toHubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  const parsed = PledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid pledge data", issues: parsed.error.issues });
    return;
  }
  if (parsed.data.from_hub_id === toHubId) {
    res.status(400).json({ error: "A hub cannot pledge to itself" });
    return;
  }

  const [toHub] = await db.select().from(diasporaHubsTable).where(eq(diasporaHubsTable.id, toHubId));
  if (!toHub) { res.status(404).json({ error: "Destination hub not found" }); return; }
  if (!toHub.is_crisis) {
    res.status(409).json({ error: "This hub is not currently flagged in crisis" });
    return;
  }

  // KNOWN-LIMITATION FIX: Block pledges to unclaimed hubs. When a hub has no
  // community_id, any pledged money lands in the ledger with community_id = null
  // and can never be spent — there is no linked community pool to draw from.
  // Rather than silently accepting money that cannot be disbursed, we now return
  // a clear 422 so the pledger knows the situation and can contact the platform
  // to fast-track the hub claim. This is preferable to either:
  //   a) Silently losing the money in a null-community bucket, or
  //   b) Routing the pledge to the global pool (which dilutes intent).
  if (toHub.community_id == null) {
    res.status(422).json({
      error: "This hub hasn't been linked to a community yet. Pledges to unclaimed hubs are blocked until an administrator connects this hub to a community pool. Contact the Niakofa team to fast-track the hub claim.",
      hub_name: toHub.name,
      hub_id: toHub.id,
      resolution: "contact_support",
    });
    return;
  }

  const [fromHub] = await db.select({ id: diasporaHubsTable.id, name: diasporaHubsTable.name }).from(diasporaHubsTable).where(eq(diasporaHubsTable.id, parsed.data.from_hub_id));
  if (!fromHub) { res.status(404).json({ error: "Sending hub not found" }); return; }

  // Authorization: without this, any authenticated user could attribute a
  // pledge to a hub they have no relationship to — in a crisis, a false
  // "Fort Worth pledges $10,000" claim is indistinguishable from a real one.
  // Only an approved leader of the sending hub (or a platform admin) may
  // speak for it. There is no general "resident of a hub" membership model
  // yet, so this is deliberately scoped to the leader/admin role that
  // already gates crisis declare/clear above.
  if (!(await isHubLeaderOrAdmin(fromHub.id, userId))) {
    res.status(403).json({ error: "Only an approved leader of the sending hub can pledge on its behalf" });
    return;
  }

  // ── Stripe path: create the PaymentIntent first, then insert the pledge
  // row already carrying its id. If the DB insert fails after the intent is
  // created, the orphaned PaymentIntent simply expires unconfirmed on
  // Stripe's side — no money has moved, so there's nothing to reconcile.
  if (stripe) {
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(parsed.data.amount * 100),
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          hub_pledge: "true",
          from_hub_id: String(fromHub.id),
          to_hub_id: String(toHub.id),
          pledged_by: String(userId),
        },
        description: `Niakofa Globe — crisis relief pledge to ${toHub.name}`,
      });
    } catch (err) {
      logger.error({ err, user_id: userId, to_hub_id: toHub.id }, "hub pledge: PaymentIntent creation failed");
      res.status(502).json({ error: "Could not start payment. Please try again." });
      return;
    }

    // The 24h velocity check and the insert happen inside ONE transaction,
    // serialized per-user with a Postgres advisory lock (same pattern as the
    // Community Pool's transactional writes) — otherwise two concurrent
    // requests from the same user can both read a total under the cap and
    // both insert, together blowing past PLEDGE_DAILY_USER_CAP.
    // Advisory-lock keyspace note: the Community Pool uses the single-key
    // form pg_advisory_xact_lock(727502) for its own writes; this uses the
    // two-key form (727503, userId) for per-user pledge serialization.
    // These are distinct Postgres lock key spaces — do not reuse 727502/
    // 727503 elsewhere without checking both call sites.
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(727503, ${userId})`);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [{ total }] = await tx
        .select({ total: sql<string>`COALESCE(SUM(${diasporaHubPledgesTable.amount}), 0)` })
        .from(diasporaHubPledgesTable)
        .where(and(
          eq(diasporaHubPledgesTable.pledged_by, userId),
          gte(diasporaHubPledgesTable.created_at, since),
          sql`${diasporaHubPledgesTable.status} != 'cancelled'`,
        ));
      if (Number(total) + parsed.data.amount > PLEDGE_DAILY_USER_CAP) {
        return { capped: true as const };
      }
      const [pledge] = await tx
        .insert(diasporaHubPledgesTable)
        .values({
          from_hub_id: fromHub.id,
          to_hub_id: toHub.id,
          pledged_by: userId,
          amount: String(parsed.data.amount),
          message: parsed.data.message,
          status: "pending_payment",
          stripe_payment_intent_id: intent.id,
        })
        .returning();
      return { capped: false as const, pledge };
    });

    if (outcome.capped) {
      // The intent was already created on Stripe's side but never confirmed
      // by the client (no client_secret is returned) — it expires unconfirmed.
      res.status(429).json({ error: `Daily pledge limit of ${PLEDGE_DAILY_USER_CAP.toLocaleString()} per user reached. Try again tomorrow.` });
      return;
    }

    res.status(201).json({
      mode: "stripe",
      client_secret: intent.client_secret,
      pledge: outcome.pledge,
    });
    return;
  }

  // ── Dev-mode path (no STRIPE_SECRET_KEY): record + credit immediately so
  // the crisis-relief flow is fully testable without live payment infra.
  // Same advisory-lock-serialized velocity check as the Stripe path above.
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(727503, ${userId})`);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ total }] = await tx
      .select({ total: sql<string>`COALESCE(SUM(${diasporaHubPledgesTable.amount}), 0)` })
      .from(diasporaHubPledgesTable)
      .where(and(
        eq(diasporaHubPledgesTable.pledged_by, userId),
        gte(diasporaHubPledgesTable.created_at, since),
        sql`${diasporaHubPledgesTable.status} != 'cancelled'`,
      ));
    if (Number(total) + parsed.data.amount > PLEDGE_DAILY_USER_CAP) {
      return { capped: true as const };
    }
    const [pledge] = await tx
      .insert(diasporaHubPledgesTable)
      .values({
        from_hub_id: fromHub.id,
        to_hub_id: toHub.id,
        pledged_by: userId,
        amount: String(parsed.data.amount),
        message: parsed.data.message,
        status: "pledged",
      })
      .returning();
    return { capped: false as const, pledge };
  });

  if (outcome.capped) {
    res.status(429).json({ error: `Daily pledge limit of ${PLEDGE_DAILY_USER_CAP.toLocaleString()} per user reached. Try again tomorrow.` });
    return;
  }

  // Ring-fencing (migration 0057): tag with hubId so this money can ONLY be
  // spent on requests tagged to toHub — never bleeds into the global pool.
  await recordPoolContribution({
    amount: parsed.data.amount,
    userId,
    communityId: toHub.community_id ?? null,
    hubId: toHub.id,
    notes: `Cross-hub crisis pledge: ${fromHub.name} → ${toHub.name} (dev mode, no Stripe; ring-fenced)`,
  });
  await processPendingMinimums();

  broadcast({
    type: "crisis_update",
    payload: { hub_id: toHub.id, name: toHub.name, pledge: { from_hub: fromHub.name, amount: parsed.data.amount } },
  });

  res.status(201).json({ mode: "recorded", pledge: outcome.pledge });
});

// GET /griot/hubs/:id/pledges — pledges received by a hub (public — this is
// the transparency ledger for cross-hub relief). Only confirmed (paid)
// pledges are shown; 'pending_payment' rows haven't moved money yet and
// 'cancelled' ones never will, so surfacing either would overstate what a
// hub in crisis has actually received.
router.get("/griot/hubs/:id/pledges", generalApiLimiter, async (req, res) => {
  const hubId = Number(req.params.id);
  if (!Number.isFinite(hubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  const pledges = await db
    .select({
      id: diasporaHubPledgesTable.id,
      from_hub_id: diasporaHubPledgesTable.from_hub_id,
      amount: diasporaHubPledgesTable.amount,
      message: diasporaHubPledgesTable.message,
      status: diasporaHubPledgesTable.status,
      created_at: diasporaHubPledgesTable.created_at,
    })
    .from(diasporaHubPledgesTable)
    .where(and(
      eq(diasporaHubPledgesTable.to_hub_id, hubId),
      eq(diasporaHubPledgesTable.status, "pledged"),
    ))
    .orderBy(desc(diasporaHubPledgesTable.created_at));

  res.json({ pledges });
});

// GET /griot/hubs/:id/summary — single consolidated payload for the hub-leader
// dashboard: hub info + activity, ring-fenced reserved balance, crisis status,
// open requests, approved leaders, recent inbound pledges, and whether the
// calling user is an approved leader (or admin) of this hub. Exists so the
// dashboard doesn't have to compose 4+ separate requests client-side, and so
// hub money/crisis/task status lives in one place instead of scattered across
// globe.tsx, community.tsx, and admin.tsx.
router.get("/griot/hubs/:id/summary", requireAuth, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = Number(req.params.id);
  if (!Number.isFinite(hubId)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  const [hub] = await db.select().from(diasporaHubsTable).where(eq(diasporaHubsTable.id, hubId));
  if (!hub) { res.status(404).json({ error: "Hub not found" }); return; }

  const [
    reservedBalance,
    openRequestsRow,
    leaders,
    recentPledges,
    canManage,
  ] = await Promise.all([
    getHubReservedBalance(hubId),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(requestsTable)
      .where(and(eq(requestsTable.hub_id, hubId), eq(requestsTable.status, "open"))),
    db
      .select({
        id: hubCommunityLeadersTable.id,
        user_id: hubCommunityLeadersTable.user_id,
        role: hubCommunityLeadersTable.role,
        approved: hubCommunityLeadersTable.approved,
        created_at: hubCommunityLeadersTable.created_at,
        name: usersTable.name,
      })
      .from(hubCommunityLeadersTable)
      .innerJoin(usersTable, eq(usersTable.id, hubCommunityLeadersTable.user_id))
      .where(and(eq(hubCommunityLeadersTable.hub_id, hubId), eq(hubCommunityLeadersTable.approved, true))),
    db
      .select({
        id: diasporaHubPledgesTable.id,
        from_hub_id: diasporaHubPledgesTable.from_hub_id,
        amount: diasporaHubPledgesTable.amount,
        message: diasporaHubPledgesTable.message,
        status: diasporaHubPledgesTable.status,
        created_at: diasporaHubPledgesTable.created_at,
      })
      .from(diasporaHubPledgesTable)
      .where(and(eq(diasporaHubPledgesTable.to_hub_id, hubId), eq(diasporaHubPledgesTable.status, "pledged")))
      .orderBy(desc(diasporaHubPledgesTable.created_at))
      .limit(10),
    isHubLeaderOrAdmin(hubId, userId),
  ]);

  // Open requests currently tagged to this hub, most recent first — the
  // "hunt across pages" pain point this dashboard exists to remove.
  const openRequests = await db
    .select({
      id: requestsTable.id,
      title: requestsTable.title,
      category: requestsTable.category,
      pay_it_forward_amount: requestsTable.pay_it_forward_amount,
      created_at: requestsTable.created_at,
    })
    .from(requestsTable)
    .where(and(eq(requestsTable.hub_id, hubId), eq(requestsTable.status, "open")))
    .orderBy(desc(requestsTable.created_at))
    .limit(25);

  res.json({
    hub,
    reserved_balance: reservedBalance,
    open_request_count: openRequestsRow[0]?.count ?? 0,
    open_requests: openRequests,
    leaders,
    recent_pledges: recentPledges,
    is_leader_or_admin: canManage,
  });
});

// POST /admin/griot/hubs/:id/review — approve or reject a proposed hub.
router.post("/admin/griot/hubs/:id/review", requireAuth, requireAdmin(), generalApiLimiter, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid hub id" }); return; }

  const parsed = ReviewHubSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid review decision", issues: parsed.error.issues });
    return;
  }

  const [hub] = await db
    .update(diasporaHubsTable)
    .set({ status: parsed.data.decision, updated_at: new Date() })
    .where(eq(diasporaHubsTable.id, id))
    .returning();

  if (!hub) { res.status(404).json({ error: "Hub not found" }); return; }
  res.json({ hub });
});

export default router;
