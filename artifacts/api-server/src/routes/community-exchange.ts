import { Router } from "express";
import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  db,
  directMessageBlocksTable,
  exchangeListingsTable,
  exchangePickupRequestsTable,
  reportsTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter, communityPostLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";

const router = Router();

const CATEGORY_VALUES = ["household", "clothing", "food", "books", "electronics", "children", "other"] as const;
const CONDITION_VALUES = ["new", "like_new", "good", "well_loved"] as const;
const NO_PRIVATE_CONTACT = /(?:https?:\/\/|www\.|@|(?:\+?[\d][\d\s().-]{6,}\d)|\b(?:text|call|email|venmo|cash\s*app|zelle|whatsapp|telegram)\b)/i;

const listingBody = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(CATEGORY_VALUES),
  condition: z.enum(CONDITION_VALUES),
  neighborhood: z.string().trim().min(2).max(80),
  pickup_notes: z.string().trim().max(500).optional().default(""),
});

const pickupBody = z.object({
  note: z.string().trim().min(3).max(1000),
  pickup_area: z.string().trim().min(2).max(100),
  proposed_window: z.string().trim().min(2).max(120),
});

const reportBody = z.object({
  type: z.enum(["fraud", "harassment", "dangerous_behavior", "spam", "other"]),
  description: z.string().trim().min(10).max(2000),
});

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safeCoarseText(value: string): boolean {
  return !NO_PRIVATE_CONTACT.test(value);
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeListing(listing: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(listing).map(([key, value]) => [key, serialize(value)]));
}

async function isBlockedBetween(firstUserId: number, secondUserId: number): Promise<boolean> {
  const [block] = await db
    .select({ blocker_id: directMessageBlocksTable.blocker_id })
    .from(directMessageBlocksTable)
    .where(or(
      and(eq(directMessageBlocksTable.blocker_id, firstUserId), eq(directMessageBlocksTable.blocked_id, secondUserId)),
      and(eq(directMessageBlocksTable.blocker_id, secondUserId), eq(directMessageBlocksTable.blocked_id, firstUserId)),
    ))
    .limit(1);
  return Boolean(block);
}

const listingSelect = {
  id: exchangeListingsTable.id,
  seller_id: exchangeListingsTable.seller_id,
  title: exchangeListingsTable.title,
  description: exchangeListingsTable.description,
  category: exchangeListingsTable.category,
  condition: exchangeListingsTable.condition,
  neighborhood: exchangeListingsTable.neighborhood,
  pickup_notes: exchangeListingsTable.pickup_notes,
  status: exchangeListingsTable.status,
  moderation_status: exchangeListingsTable.moderation_status,
  created_at: exchangeListingsTable.created_at,
  updated_at: exchangeListingsTable.updated_at,
  seller_name: usersTable.name,
  seller_avatar_url: usersTable.avatar_url,
};

router.get("/community/exchange/listings", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const mine = req.query.mine === "true";
  const category = typeof req.query.category === "string" && CATEGORY_VALUES.includes(req.query.category as typeof CATEGORY_VALUES[number])
    ? req.query.category
    : undefined;
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";

  const conditions = mine
    ? eq(exchangeListingsTable.seller_id, userId)
    : and(eq(exchangeListingsTable.status, "active"), eq(exchangeListingsTable.moderation_status, "approved"));
  const rows = await db
    .select(listingSelect)
    .from(exchangeListingsTable)
    .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
    .where(and(
      conditions,
      category ? eq(exchangeListingsTable.category, category) : undefined,
      query ? sql`(${exchangeListingsTable.title} ILIKE ${`%${query.replace(/[%_]/g, "\\$&")}%`} OR ${exchangeListingsTable.description} ILIKE ${`%${query.replace(/[%_]/g, "\\$&")}%`})` : undefined,
    ))
    .orderBy(desc(exchangeListingsTable.created_at), desc(exchangeListingsTable.id))
    .limit(100);

  return res.json({ listings: rows.map((row) => serializeListing(row as unknown as Record<string, unknown>)) });
});

router.get("/community/exchange/listings/:id", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid listing id" });
  const [listing] = await db
    .select(listingSelect)
    .from(exchangeListingsTable)
    .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
    .where(eq(exchangeListingsTable.id, id))
    .limit(1);
  if (!listing || (listing.moderation_status !== "approved" && listing.seller_id !== req.authenticatedUserId)) {
    return res.status(404).json({ error: "Listing not found" });
  }
  return res.json({ listing: serializeListing(listing as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/listings", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const parsed = listingBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid listing", details: parsed.error.issues });
  const data = parsed.data;
  if (![data.neighborhood, data.pickup_notes].every(safeCoarseText)) {
    return res.status(400).json({ error: "Use a neighborhood or public pickup area only. Do not include phone numbers, email addresses, links, or exact contact details." });
  }
  const moderation = moderatePostText(`${data.title}\n${data.description}\n${data.pickup_notes}`);
  const [listing] = await db.insert(exchangeListingsTable).values({
    seller_id: req.authenticatedUserId!,
    title: data.title,
    description: data.description,
    category: data.category,
    condition: data.condition,
    neighborhood: data.neighborhood,
    pickup_notes: data.pickup_notes || null,
    moderation_status: moderation.status,
    moderation_reason: moderation.reason,
  }).returning();
  return res.status(201).json({
    listing: serializeListing(listing as unknown as Record<string, unknown>),
    message: moderation.status === "approved"
      ? "Listing published."
      : "Listing saved for safety review before it appears publicly.",
  });
});

router.post("/community/exchange/listings/:id/withdraw", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid listing id" });
  const [listing] = await db.select().from(exchangeListingsTable).where(and(
    eq(exchangeListingsTable.id, id),
    eq(exchangeListingsTable.seller_id, req.authenticatedUserId!),
  )).limit(1);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  if (listing.status === "reserved") return res.status(409).json({ error: "Cancel the accepted pickup before withdrawing this listing." });
  if (listing.status !== "active") return res.status(409).json({ error: "This listing is no longer active." });
  const [updated] = await db.update(exchangeListingsTable)
    .set({ status: "withdrawn", updated_at: new Date() })
    .where(and(eq(exchangeListingsTable.id, id), eq(exchangeListingsTable.status, "active")))
    .returning();
  return res.json({ listing: serializeListing(updated as unknown as Record<string, unknown>) });
});

router.get("/community/exchange/pickup-requests", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const rows = await db
    .select({
      id: exchangePickupRequestsTable.id,
      listing_id: exchangePickupRequestsTable.listing_id,
      buyer_id: exchangePickupRequestsTable.buyer_id,
      note: exchangePickupRequestsTable.note,
      pickup_area: exchangePickupRequestsTable.pickup_area,
      proposed_window: exchangePickupRequestsTable.proposed_window,
      status: exchangePickupRequestsTable.status,
      buyer_confirmed_at: exchangePickupRequestsTable.buyer_confirmed_at,
      seller_confirmed_at: exchangePickupRequestsTable.seller_confirmed_at,
      accepted_at: exchangePickupRequestsTable.accepted_at,
      cancelled_at: exchangePickupRequestsTable.cancelled_at,
      completed_at: exchangePickupRequestsTable.completed_at,
      created_at: exchangePickupRequestsTable.created_at,
      updated_at: exchangePickupRequestsTable.updated_at,
      listing_title: exchangeListingsTable.title,
      listing_status: exchangeListingsTable.status,
      seller_id: exchangeListingsTable.seller_id,
      seller_name: sql<string>`seller.name`,
      buyer_name: sql<string>`buyer.name`,
    })
    .from(exchangePickupRequestsTable)
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
    .innerJoin(sql`users seller`, sql`seller.id = ${exchangeListingsTable.seller_id}`)
    .innerJoin(sql`users buyer`, sql`buyer.id = ${exchangePickupRequestsTable.buyer_id}`)
    .where(or(eq(exchangePickupRequestsTable.buyer_id, userId), eq(exchangeListingsTable.seller_id, userId)))
    .orderBy(desc(exchangePickupRequestsTable.updated_at), desc(exchangePickupRequestsTable.id))
    .limit(100);
  return res.json({ pickup_requests: rows.map((row) => serializeListing(row as unknown as Record<string, unknown>)) });
});

router.post("/community/exchange/listings/:id/pickup-requests", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const listingId = parseId(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Invalid listing id" });
  const parsed = pickupBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid pickup request", details: parsed.error.issues });
  if (![parsed.data.note, parsed.data.pickup_area, parsed.data.proposed_window].every(safeCoarseText)) {
    return res.status(400).json({ error: "Keep pickup coordination inside Niakofa and use a coarse public area. Do not include phone numbers, email addresses, links, or exact addresses." });
  }
  const userId = req.authenticatedUserId!;
  const [listing] = await db.select().from(exchangeListingsTable).where(eq(exchangeListingsTable.id, listingId)).limit(1);
  if (!listing || listing.status !== "active" || listing.moderation_status !== "approved") return res.status(404).json({ error: "Listing is not available." });
  if (listing.seller_id === userId) return res.status(400).json({ error: "You cannot request your own listing." });
  if (await isBlockedBetween(userId, listing.seller_id)) return res.status(403).json({ error: "Messaging is blocked between these accounts." });
  const [existing] = await db.select({ id: exchangePickupRequestsTable.id })
    .from(exchangePickupRequestsTable)
    .where(and(eq(exchangePickupRequestsTable.listing_id, listingId), eq(exchangePickupRequestsTable.buyer_id, userId)))
    .limit(1);
  if (existing) return res.status(409).json({ error: "You already have a pickup request for this listing." });
  const [pickupRequest] = await db.insert(exchangePickupRequestsTable).values({
    listing_id: listingId,
    buyer_id: userId,
    note: parsed.data.note,
    pickup_area: parsed.data.pickup_area,
    proposed_window: parsed.data.proposed_window,
  }).returning();
  return res.status(201).json({ pickup_request: serializeListing(pickupRequest as unknown as Record<string, unknown>) });
});

async function loadPickupRequest(id: number) {
  const [row] = await db.select({
    id: exchangePickupRequestsTable.id,
    listing_id: exchangePickupRequestsTable.listing_id,
    buyer_id: exchangePickupRequestsTable.buyer_id,
    status: exchangePickupRequestsTable.status,
    buyer_confirmed_at: exchangePickupRequestsTable.buyer_confirmed_at,
    seller_confirmed_at: exchangePickupRequestsTable.seller_confirmed_at,
    seller_id: exchangeListingsTable.seller_id,
    listing_status: exchangeListingsTable.status,
  }).from(exchangePickupRequestsTable)
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
    .where(eq(exchangePickupRequestsTable.id, id)).limit(1);
  return row ?? null;
}

router.post("/community/exchange/pickup-requests/:id/accept", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const userId = req.authenticatedUserId!;
  const result = await db.transaction(async (tx) => {
    const [pickup] = await tx.select({
      id: exchangePickupRequestsTable.id,
      listing_id: exchangePickupRequestsTable.listing_id,
      buyer_id: exchangePickupRequestsTable.buyer_id,
      status: exchangePickupRequestsTable.status,
      seller_id: exchangeListingsTable.seller_id,
      listing_status: exchangeListingsTable.status,
    }).from(exchangePickupRequestsTable)
      .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
      .where(eq(exchangePickupRequestsTable.id, id)).limit(1);
    if (!pickup) return { error: "Pickup request not found", status: 404 as const };
    if (pickup.seller_id !== userId) return { error: "Only the seller can accept this request.", status: 403 as const };
    if (pickup.status !== "requested" || pickup.listing_status !== "active") return { error: "This request is no longer available to accept.", status: 409 as const };
    const [listing] = await tx.update(exchangeListingsTable)
      .set({ status: "reserved", updated_at: new Date() })
      .where(and(eq(exchangeListingsTable.id, pickup.listing_id), eq(exchangeListingsTable.status, "active"))).returning({ id: exchangeListingsTable.id });
    if (!listing) return { error: "Another pickup request was accepted first.", status: 409 as const };
    const [updated] = await tx.update(exchangePickupRequestsTable)
      .set({ status: "accepted", accepted_at: new Date(), updated_at: new Date() })
      .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "requested"))).returning();
    return { pickup_request: updated };
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  return res.json({ pickup_request: serializeListing(result.pickup_request as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/pickup-requests/:id/decline", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const pickup = await loadPickupRequest(id);
  if (!pickup) return res.status(404).json({ error: "Pickup request not found" });
  if (pickup.seller_id !== req.authenticatedUserId) return res.status(403).json({ error: "Only the seller can decline this request." });
  if (pickup.status !== "requested") return res.status(409).json({ error: "This request is no longer awaiting a response." });
  const [updated] = await db.update(exchangePickupRequestsTable)
    .set({ status: "declined", cancelled_at: new Date(), updated_at: new Date() })
    .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "requested"))).returning();
  return res.json({ pickup_request: serializeListing(updated as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/pickup-requests/:id/cancel", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const pickup = await loadPickupRequest(id);
  if (!pickup) return res.status(404).json({ error: "Pickup request not found" });
  if (pickup.buyer_id !== req.authenticatedUserId && pickup.seller_id !== req.authenticatedUserId) return res.status(403).json({ error: "Only the pickup participants can cancel." });
  if (!["requested", "accepted"].includes(pickup.status)) return res.status(409).json({ error: "This pickup cannot be cancelled." });
  const result = await db.transaction(async (tx) => {
    const [updated] = await tx.update(exchangePickupRequestsTable)
      .set({ status: "cancelled", cancelled_at: new Date(), updated_at: new Date() })
      .where(and(eq(exchangePickupRequestsTable.id, id), inArray(exchangePickupRequestsTable.status, ["requested", "accepted"]))).returning();
    if (updated?.status === "cancelled" && pickup.status === "accepted") {
      await tx.update(exchangeListingsTable).set({ status: "active", updated_at: new Date() })
        .where(and(eq(exchangeListingsTable.id, pickup.listing_id), eq(exchangeListingsTable.status, "reserved")));
    }
    return updated;
  });
  if (!result) return res.status(409).json({ error: "This pickup was already changed." });
  return res.json({ pickup_request: serializeListing(result as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/pickup-requests/:id/confirm-complete", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const pickup = await loadPickupRequest(id);
  if (!pickup) return res.status(404).json({ error: "Pickup request not found" });
  const userId = req.authenticatedUserId!;
  const isBuyer = pickup.buyer_id === userId;
  const isSeller = pickup.seller_id === userId;
  if (!isBuyer && !isSeller) return res.status(403).json({ error: "Only the pickup participants can confirm completion." });
  if (pickup.status !== "accepted") return res.status(409).json({ error: "Completion can only be confirmed for an accepted pickup." });
  const now = new Date();
  const updates = isBuyer ? { buyer_confirmed_at: now, updated_at: now } : { seller_confirmed_at: now, updated_at: now };
  const [updated] = await db.update(exchangePickupRequestsTable).set(updates)
    .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "accepted"))).returning();
  if (!updated) return res.status(409).json({ error: "This pickup was already changed." });
  const bothConfirmed = Boolean(updated.buyer_confirmed_at && updated.seller_confirmed_at);
  if (bothConfirmed) {
    const [completed] = await db.transaction(async (tx) => {
      const [done] = await tx.update(exchangePickupRequestsTable)
        .set({ status: "completed", completed_at: now, updated_at: now })
        .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "accepted"))).returning();
      if (done) await tx.update(exchangeListingsTable).set({ status: "completed", updated_at: now })
        .where(eq(exchangeListingsTable.id, pickup.listing_id));
      return [done];
    });
    return res.json({ pickup_request: serializeListing((completed ?? updated) as unknown as Record<string, unknown>) });
  }
  return res.json({ pickup_request: serializeListing(updated as unknown as Record<string, unknown>), awaiting_other_confirmation: true });
});

router.post("/community/exchange/listings/:id/report", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const listingId = parseId(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Invalid listing id" });
  const parsed = reportBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid report", details: parsed.error.issues });
  const [listing] = await db.select({ seller_id: exchangeListingsTable.seller_id, title: exchangeListingsTable.title })
    .from(exchangeListingsTable).where(eq(exchangeListingsTable.id, listingId)).limit(1);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  if (listing.seller_id === req.authenticatedUserId) return res.status(400).json({ error: "You cannot report your own listing." });
  const [report] = await db.insert(reportsTable).values({
    reporter_id: req.authenticatedUserId!,
    reported_user_id: listing.seller_id,
    type: parsed.data.type,
    description: `Exchange listing #${listingId} (“${listing.title}”): ${parsed.data.description}`,
  }).returning();
  return res.status(201).json({ report_id: report.id, message: "Thanks. The listing has been sent to the safety team." });
});

export default router;