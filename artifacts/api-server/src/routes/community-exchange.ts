import { Router } from "express";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
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
import { sendPushToUser } from "./push";

const router = Router();

const CATEGORY_VALUES = ["household", "clothing", "food", "books", "electronics", "children", "other"] as const;
const CONDITION_VALUES = ["new", "like_new", "good", "well_loved"] as const;
const LISTING_TYPE_VALUES = ["offer", "need"] as const;
const RESOURCE_TYPE_VALUES = ["goods", "services"] as const;
const NO_PRIVATE_CONTACT = /(?:https?:\/\/|www\.|@|(?:\+?[\d][\d\s().-]{6,}\d)|\b(?:text|call|email|venmo|cash\s*app|zelle|whatsapp|telegram)\b)/i;
const EXCHANGE_IMPACT_PRIVACY_THRESHOLD = 5;

const listingBody = z.object({
  listing_type: z.enum(LISTING_TYPE_VALUES).default("offer"),
  resource_type: z.enum(RESOURCE_TYPE_VALUES).default("goods"),
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

function roundedCoordinate(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : Math.round(value * 100) / 100;
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeListing(listing: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(listing).map(([key, value]) => [key, serialize(value)]));
}

const EXCHANGE_LISTING_PAGE_SIZE = 24;
const EXCHANGE_LISTING_MAX_PAGE_SIZE = 50;

type ListingCursor = { created_at: string; id: number };

function encodeListingCursor(listing: { created_at: Date; id: number }): string {
  return Buffer.from(JSON.stringify({
    created_at: listing.created_at.toISOString(),
    id: listing.id,
  })).toString("base64url");
}

function decodeListingCursor(value: unknown): ListingCursor | null {
  if (typeof value !== "string" || value.length > 200) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ListingCursor>;
    const createdAt = typeof parsed.created_at === "string" ? new Date(parsed.created_at) : null;
    const id = parsed.id;
    if (!createdAt || Number.isNaN(createdAt.getTime())
      || typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null;
    return { created_at: createdAt.toISOString(), id };
  } catch {
    return null;
  }
}

function clampRadius(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, parsed)) : 15;
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
  listing_type: exchangeListingsTable.listing_type,
  resource_type: exchangeListingsTable.resource_type,
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
  const nearby = req.query.nearby === "true";
  const listingType = typeof req.query.type === "string" && LISTING_TYPE_VALUES.includes(req.query.type as typeof LISTING_TYPE_VALUES[number])
    ? req.query.type
    : undefined;
  const resourceType = typeof req.query.resource_type === "string" && RESOURCE_TYPE_VALUES.includes(req.query.resource_type as typeof RESOURCE_TYPE_VALUES[number])
    ? req.query.resource_type
    : undefined;
  const neighborhood = typeof req.query.neighborhood === "string" ? req.query.neighborhood.trim().slice(0, 80) : "";
  const category = typeof req.query.category === "string" && CATEGORY_VALUES.includes(req.query.category as typeof CATEGORY_VALUES[number])
    ? req.query.category
    : undefined;
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  const requestedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : EXCHANGE_LISTING_PAGE_SIZE;
  const pageSize = Number.isSafeInteger(requestedLimit)
    ? Math.min(EXCHANGE_LISTING_MAX_PAGE_SIZE, Math.max(1, requestedLimit))
    : EXCHANGE_LISTING_PAGE_SIZE;
  const cursorValue = req.query.cursor;
  const cursor = cursorValue == null ? null : decodeListingCursor(cursorValue);
  if (cursorValue != null && !cursor) return res.status(400).json({ error: "Invalid listing cursor" });

  let viewerLocation: { lat: number | null; lng: number | null } | null = null;
  if (nearby) {
    const [viewer] = await db.select({ lat: usersTable.lat, lng: usersTable.lng })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    viewerLocation = viewer ?? null;
  }

  let locationCondition:
    | ReturnType<typeof and>
    | ReturnType<typeof eq>
    | ReturnType<typeof sql>
    | undefined;
  if (nearby && viewerLocation?.lat != null && viewerLocation.lng != null
      && Number.isFinite(viewerLocation.lat) && Number.isFinite(viewerLocation.lng)) {
    const radius = clampRadius(req.query.radius_miles);
    const latDelta = radius / 69;
    const lngDelta = radius / (69 * Math.max(0.25, Math.cos((viewerLocation.lat * Math.PI) / 180)));
    // The bounding box uses the composite geo index; the Haversine expression
    // removes the box's corner false positives without requiring PostGIS.
    locationCondition = and(
      sql`${exchangeListingsTable.latitude} IS NOT NULL AND ${exchangeListingsTable.longitude} IS NOT NULL`,
      sql`${exchangeListingsTable.latitude} BETWEEN ${viewerLocation.lat - latDelta} AND ${viewerLocation.lat + latDelta}`,
      sql`${exchangeListingsTable.longitude} BETWEEN ${viewerLocation.lng - lngDelta} AND ${viewerLocation.lng + lngDelta}`,
      sql`3958.8 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(${exchangeListingsTable.latitude} - ${viewerLocation.lat}) / 2), 2) +
        COS(RADIANS(${viewerLocation.lat})) * COS(RADIANS(${exchangeListingsTable.latitude})) *
        POWER(SIN(RADIANS(${exchangeListingsTable.longitude} - ${viewerLocation.lng}) / 2), 2)
      )) <= ${radius}`,
    );
  } else if (neighborhood) {
    locationCondition = eq(exchangeListingsTable.neighborhood, neighborhood);
  } else if (nearby) {
    // A nearby request without coordinates must not silently become a
    // community-wide feed.
    locationCondition = sql`FALSE`;
  }

  const conditions = mine
    ? eq(exchangeListingsTable.seller_id, userId)
    : and(eq(exchangeListingsTable.status, "active"), eq(exchangeListingsTable.moderation_status, "approved"));
  const rows = await db
    .select(listingSelect)
    .from(exchangeListingsTable)
    .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
    .where(and(
      conditions,
      listingType ? eq(exchangeListingsTable.listing_type, listingType) : undefined,
      resourceType ? eq(exchangeListingsTable.resource_type, resourceType) : undefined,
      locationCondition,
      category ? eq(exchangeListingsTable.category, category) : undefined,
      query ? sql`(${exchangeListingsTable.title} ILIKE ${`%${query.replace(/[%_]/g, "\\$&")}%`} OR ${exchangeListingsTable.description} ILIKE ${`%${query.replace(/[%_]/g, "\\$&")}%`})` : undefined,
      cursor
        ? or(
          lt(exchangeListingsTable.created_at, new Date(cursor.created_at)),
          and(
            eq(exchangeListingsTable.created_at, new Date(cursor.created_at)),
            lt(exchangeListingsTable.id, cursor.id),
          ),
        )
        : undefined,
    ))
    .orderBy(desc(exchangeListingsTable.created_at), desc(exchangeListingsTable.id))
    .limit(pageSize + 1);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  return res.json({
    listings: pageRows.map((row) => serializeListing(row as unknown as Record<string, unknown>)),
    next_cursor: hasMore ? encodeListingCursor(pageRows[pageRows.length - 1]) : null,
  });
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
  const [seller] = await db.select({ lat: usersTable.lat, lng: usersTable.lng })
    .from(usersTable)
    .where(eq(usersTable.id, req.authenticatedUserId!))
    .limit(1);
  const [listing] = await db.insert(exchangeListingsTable).values({
    seller_id: req.authenticatedUserId!,
    listing_type: data.listing_type,
    resource_type: data.resource_type,
    title: data.title,
    description: data.description,
    category: data.category,
    condition: data.condition,
    neighborhood: data.neighborhood,
    pickup_notes: data.pickup_notes || null,
    latitude: roundedCoordinate(seller?.lat),
    longitude: roundedCoordinate(seller?.lng),
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
    .where(and(
      eq(exchangePickupRequestsTable.listing_id, listingId),
      eq(exchangePickupRequestsTable.buyer_id, userId),
      inArray(exchangePickupRequestsTable.status, ["requested", "accepted"]),
    ))
    .limit(1);
  if (existing) return res.status(409).json({ error: "You already have a pickup request for this listing." });
  const [pickupRequest] = await db.insert(exchangePickupRequestsTable).values({
    listing_id: listingId,
    buyer_id: userId,
    note: parsed.data.note,
    pickup_area: parsed.data.pickup_area,
    proposed_window: parsed.data.proposed_window,
  }).returning();
  void sendPushToUser(listing.seller_id, {
    title: "A neighbor wants to coordinate",
    body: `Someone responded to “${listing.title}”. Open Exchange to review the request.`,
    notifType: "task_accepted",
  }).catch(() => {});
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

type AcceptPickupResult =
  | { error: string; status: 403 | 404 | 409 }
  | { pickup_request: typeof exchangePickupRequestsTable.$inferSelect };

router.post("/community/exchange/pickup-requests/:id/accept", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const userId = req.authenticatedUserId!;
  const result = await db.transaction(async (tx): Promise<AcceptPickupResult> => {
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
    if (!updated) return { error: "This pickup request was already changed.", status: 409 as const };
    return { pickup_request: updated };
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  void sendPushToUser(result.pickup_request.buyer_id, {
    title: "Your Exchange request was accepted",
    body: "Your neighbor accepted the coordination request. Open Exchange to confirm the handoff details.",
    notifType: "task_accepted",
  }).catch(() => {});
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
  if (updated) {
    void sendPushToUser(updated.buyer_id, {
      title: "Your Exchange request was declined",
      body: "This coordination request was declined. You can browse Exchange for other ways to connect with a neighbor.",
      notifType: "task_accepted",
    }).catch(() => {});
  }
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
  const otherParticipantId = req.authenticatedUserId === pickup.buyer_id ? pickup.seller_id : pickup.buyer_id;
  void sendPushToUser(otherParticipantId, {
    title: "Exchange coordination was cancelled",
    body: "The other participant cancelled this pickup coordination. The listing is available again if it is still active.",
    notifType: "task_accepted",
  }).catch(() => {});
  return res.json({ pickup_request: serializeListing(result as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/pickup-requests/:id/confirm-complete", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const userId = req.authenticatedUserId!;
  type ConfirmCompleteResult =
    | { error: string; status: 403 | 404 | 409 }
    | {
      pickup_request: typeof exchangePickupRequestsTable.$inferSelect;
      awaiting_other_confirmation?: boolean;
      notifyUserIds: number[];
    };
  const result = await db.transaction(async (tx): Promise<ConfirmCompleteResult> => {
    const [pickup] = await tx.select({
      id: exchangePickupRequestsTable.id,
      listing_id: exchangePickupRequestsTable.listing_id,
      buyer_id: exchangePickupRequestsTable.buyer_id,
      seller_id: exchangeListingsTable.seller_id,
      status: exchangePickupRequestsTable.status,
      buyer_confirmed_at: exchangePickupRequestsTable.buyer_confirmed_at,
      seller_confirmed_at: exchangePickupRequestsTable.seller_confirmed_at,
    }).from(exchangePickupRequestsTable)
      .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
      .where(eq(exchangePickupRequestsTable.id, id))
      .for("update")
      .limit(1);
    if (!pickup) return { error: "Pickup request not found", status: 404 as const };
    const isBuyer = pickup.buyer_id === userId;
    const isSeller = pickup.seller_id === userId;
    if (!isBuyer && !isSeller) return { error: "Only the pickup participants can confirm completion.", status: 403 as const };
    if (pickup.status !== "accepted") return { error: "Completion can only be confirmed for an accepted pickup.", status: 409 as const };
    const now = new Date();
    const [updated] = await tx.update(exchangePickupRequestsTable).set(
      isBuyer ? { buyer_confirmed_at: now, updated_at: now } : { seller_confirmed_at: now, updated_at: now },
    ).where(eq(exchangePickupRequestsTable.id, id)).returning();
    if (!updated) return { error: "This pickup was already changed.", status: 409 as const };
    if (updated.buyer_confirmed_at && updated.seller_confirmed_at) {
      const [completed] = await tx.update(exchangePickupRequestsTable)
        .set({ status: "completed", completed_at: now, updated_at: now })
        .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "accepted")))
        .returning();
      if (completed) {
        await tx.update(exchangeListingsTable).set({ status: "completed", updated_at: now })
          .where(and(eq(exchangeListingsTable.id, pickup.listing_id), eq(exchangeListingsTable.status, "reserved")));
      }
      return {
        pickup_request: completed ?? updated,
        notifyUserIds: [pickup.buyer_id, pickup.seller_id],
      };
    }
    return {
      pickup_request: updated,
      awaiting_other_confirmation: true as const,
      notifyUserIds: [isBuyer ? pickup.seller_id : pickup.buyer_id],
    };
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  if (result.notifyUserIds.length > 0) {
    void Promise.allSettled(result.notifyUserIds.map((participantId) => sendPushToUser(participantId, {
      title: result.awaiting_other_confirmation ? "Exchange handoff confirmation recorded" : "Exchange handoff completed",
      body: result.awaiting_other_confirmation
        ? "Your confirmation is recorded. The other participant still needs to confirm the handoff."
        : "Both participants confirmed the handoff. Thank you for closing the loop.",
      notifType: "task_accepted",
    })));
  }
  return res.json({
    pickup_request: serializeListing(result.pickup_request as unknown as Record<string, unknown>),
    ...("awaiting_other_confirmation" in result ? { awaiting_other_confirmation: result.awaiting_other_confirmation } : {}),
  });
});

router.get("/community/exchange/impact", requireAuth, requireApproved, generalApiLimiter, async (_req, res) => {
  const [activity] = await db.select({
    completed: sql<number>`COUNT(*) FILTER (WHERE ${exchangePickupRequestsTable.status} = 'completed')::int`,
    unique_neighbors: sql<number>`COUNT(DISTINCT CASE WHEN ${exchangePickupRequestsTable.status} = 'completed' THEN ${exchangePickupRequestsTable.buyer_id} END)::int`,
    last_30_days: sql<number>`COUNT(*) FILTER (WHERE ${exchangePickupRequestsTable.status} = 'completed' AND ${exchangePickupRequestsTable.completed_at} >= NOW() - INTERVAL '30 days')::int`,
  }).from(exchangePickupRequestsTable);
  const [live] = await db.select({
    active_offers: sql<number>`COUNT(*) FILTER (WHERE ${exchangeListingsTable.listing_type} = 'offer')::int`,
    active_needs: sql<number>`COUNT(*) FILTER (WHERE ${exchangeListingsTable.listing_type} = 'need')::int`,
  }).from(exchangeListingsTable).where(and(
    eq(exchangeListingsTable.status, "active"),
    eq(exchangeListingsTable.moderation_status, "approved"),
  ));
  const completed = activity?.completed ?? 0;
  const suppressed = completed < EXCHANGE_IMPACT_PRIVACY_THRESHOLD;
  return res.json({
    completed: suppressed ? null : completed,
    active_offers: live?.active_offers ?? 0,
    active_needs: live?.active_needs ?? 0,
    unique_neighbors: suppressed ? null : (activity?.unique_neighbors ?? 0),
    completed_30d: suppressed ? null : (activity?.last_30_days ?? 0),
    suppressed,
    privacy_threshold: EXCHANGE_IMPACT_PRIVACY_THRESHOLD,
    privacy_note: suppressed
      ? `Verified completion totals are shown after ${EXCHANGE_IMPACT_PRIVACY_THRESHOLD} community completions to protect small groups.`
      : "Community-wide counts use only two-party verified Exchange completions.",
  });
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
  const [existingReport] = await db.select({ id: reportsTable.id })
    .from(reportsTable)
    .where(and(
      eq(reportsTable.reporter_id, req.authenticatedUserId!),
      eq(reportsTable.reported_exchange_listing_id, listingId),
    ))
    .limit(1);
  if (existingReport) return res.status(409).json({ error: "You already reported this listing. The safety team has the report." });
  let report: typeof reportsTable.$inferSelect;
  try {
    [report] = await db.insert(reportsTable).values({
      reporter_id: req.authenticatedUserId!,
      reported_user_id: listing.seller_id,
      reported_exchange_listing_id: listingId,
      type: parsed.data.type,
      description: `Exchange listing #${listingId} (“${listing.title}”): ${parsed.data.description}`,
    }).returning();
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "You already reported this listing. The safety team has the report." });
    }
    throw error;
  }
  return res.status(201).json({ report_id: report.id, message: "Thanks. The listing has been sent to the safety team." });
});

export default router;