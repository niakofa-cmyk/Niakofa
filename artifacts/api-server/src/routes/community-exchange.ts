import { Router } from "express";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  directMessageBlocksTable,
  exchangeListingsTable,
  exchangePickupRequestsTable,
  communityStoriesTable,
  communityStoryMediaTable,
  mediaAssetsTable,
  reportsTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter, communityPostLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { sendPushToUser } from "./push";
import { createMessageNotification } from "../lib/message-notifications";
import { getExchangeMatchingLocation } from "../lib/exchange-location";
import { sanitizePublicPickupArea } from "../lib/exchange-privacy";
import { exchangePickupDisputesTable } from "@workspace/db/schema";
import { requireAdmin } from "../middlewares/authz";

const router = Router();

const CATEGORY_VALUES = ["household", "clothing", "food", "books", "electronics", "children", "urgent_aid", "other"] as const;
const CONDITION_VALUES = ["new", "like_new", "good", "well_loved"] as const;
const LISTING_TYPE_VALUES = ["offer", "need"] as const;
const RESOURCE_TYPE_VALUES = ["goods", "services"] as const;
const PICKUP_LOCATION_TYPE_VALUES = ["public_place", "community_center", "library", "park", "business_parking", "other_public"] as const;
const EXCHANGE_IMPACT_PRIVACY_THRESHOLD = 5;
const EXCHANGE_HOLD_REPORT_THRESHOLD = 3;
const EXCHANGE_PICKUP_COORDINATION_HOURS = 48;

const listingBody = z.object({
  listing_type: z.enum(LISTING_TYPE_VALUES).default("offer"),
  resource_type: z.enum(RESOURCE_TYPE_VALUES).default("goods"),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(10).max(2000),
  category: z.enum(CATEGORY_VALUES),
  condition: z.enum(CONDITION_VALUES),
  neighborhood: z.string().trim().min(2).max(80),
  pickup_location_type: z.enum(PICKUP_LOCATION_TYPE_VALUES).default("other_public"),
  pickup_notes: z.string().trim().max(500).optional().default(""),
});

const listingEditBody = z.object({
  listing_type: z.enum(LISTING_TYPE_VALUES).optional(),
  resource_type: z.enum(RESOURCE_TYPE_VALUES).optional(),
  title: z.string().trim().min(3).max(100).optional(),
  description: z.string().trim().min(10).max(2000).optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  condition: z.enum(CONDITION_VALUES).optional(),
  neighborhood: z.string().trim().min(2).max(80).optional(),
  pickup_location_type: z.enum(PICKUP_LOCATION_TYPE_VALUES).optional(),
  pickup_notes: z.string().trim().max(500).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one listing field is required.",
});

const pickupBody = z.object({
  note: z.string().trim().min(3).max(1000),
  pickup_area: z.string().trim().min(2).max(100),
  pickup_location_type: z.enum(PICKUP_LOCATION_TYPE_VALUES).default("other_public"),
  pickup_note: z.string().trim().max(500).optional(),
  proposed_window: z.string().trim().min(2).max(120),
});

const disputeBody = z.object({
  reason: z.string().trim().min(10).max(2000),
  evidence: z.string().trim().max(4000).optional(),
});

const resolveDisputeBody = z.object({
  outcome: z.enum(["complete", "cancel"]),
  resolution: z.string().trim().min(10).max(2000),
});

const reportBody = z.object({
  type: z.enum(["fraud", "harassment", "dangerous_behavior", "spam", "commercial_pricing", "spam_or_solicitation", "unsafe_or_harmful", "other"]),
  description: z.string().trim().min(10).max(2000),
});

function parseId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function safePublicListingArea(value: string): boolean {
  const coordinatePair = /[+-]?\d{1,2}\.\d+\s*[,/]\s*[+-]?\d{1,3}\.\d+/;
  return sanitizePublicPickupArea(value) && !coordinatePair.test(value);
}

function safeListingLabel(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.,!?'"’()-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "an Exchange post";
}

function exchangeMessagesActionUrl(recipientId: number, listingId: number, pickupRequestId?: number): string {
  const params = new URLSearchParams({
    mode: "direct",
    recipientId: String(recipientId),
    exchangeListingId: String(listingId),
  });
  if (pickupRequestId) params.set("exchangePickupRequestId", String(pickupRequestId));
  return `/messages?${params.toString()}`;
}

function notifyExchangeParticipant(input: {
  recipientId: number;
  actorUserId: number;
  listingId: number;
  pickupRequestId?: number;
  title: string;
  body: string;
  action?: string;
}): Promise<void> {
  return createMessageNotification({
    userId: input.recipientId,
    actorUserId: input.actorUserId,
    type: "exchange",
    title: input.title,
    body: input.body,
    actionUrl: exchangeMessagesActionUrl(input.recipientId, input.listingId, input.pickupRequestId),
    metadata: {
      exchange_listing_id: input.listingId,
      ...(input.pickupRequestId ? { exchange_pickup_request_id: input.pickupRequestId } : {}),
      ...(input.action ? { action: input.action } : {}),
    },
  });
}

function serialize(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeListing(listing: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(listing)
      .filter(([key]) => key !== "latitude" && key !== "longitude")
      .map(([key, value]) => [key, serialize(value)]),
  );
}

const EXCHANGE_LISTING_PAGE_SIZE = 24;
const EXCHANGE_LISTING_MAX_PAGE_SIZE = 50;
const EXCHANGE_SPARK_MAX_PAGE_SIZE = 40;

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

router.get("/community/exchange/sparks", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const [viewer] = await db.select({ community_id: usersTable.community_id })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const communityVisibility = or(
    eq(communityStoriesTable.author_user_id, userId),
    viewer?.community_id == null
      ? isNull(communityStoriesTable.community_id)
      : eq(communityStoriesTable.community_id, viewer.community_id),
  );
  const nearby = req.query.nearby === "true";
  if (nearby && req.query.radius_miles !== undefined && parseRadius(req.query.radius_miles) == null) {
    return res.status(400).json({ error: "radius_miles must be between 1 and 50" });
  }
  const requestedLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 24;
  const pageSize = Number.isSafeInteger(requestedLimit)
    ? Math.min(EXCHANGE_SPARK_MAX_PAGE_SIZE, Math.max(1, requestedLimit))
    : 24;
  const cursorValue = req.query.cursor;
  const cursor = cursorValue == null ? null : decodeListingCursor(cursorValue);
  if (cursorValue != null && !cursor) return res.status(400).json({ error: "Invalid Spark cursor" });

  let locationCondition: ReturnType<typeof and> | ReturnType<typeof sql> | undefined;
  if (nearby) {
    const viewerLocation = await getExchangeMatchingLocation(userId);
    if (viewerLocation?.lat != null && viewerLocation.lng != null
      && Number.isFinite(viewerLocation.lat) && Number.isFinite(viewerLocation.lng)) {
      const radius = req.query.radius_miles === undefined ? 15 : parseRadius(req.query.radius_miles)!;
      const latDelta = radius / 69;
      const lngDelta = radius / (69 * Math.max(0.25, Math.cos((viewerLocation.lat * Math.PI) / 180)));
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
    } else {
      // Missing viewer coordinates must not widen a nearby request to all Sparks.
      locationCondition = sql`FALSE`;
    }
  }

  const rows = await db.select({
    story_id: communityStoriesTable.id,
    created_at: communityStoriesTable.created_at,
    expires_at: communityStoriesTable.expires_at,
    listing_id: exchangeListingsTable.id,
    caption: communityStoriesTable.caption,
    neighborhood: exchangeListingsTable.neighborhood,
    media_id: communityStoryMediaTable.id,
    thumbnail_storage_key: communityStoryMediaTable.thumbnail_storage_key,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
  }).from(communityStoriesTable)
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, communityStoriesTable.exchange_listing_id))
    .innerJoin(usersTable, eq(usersTable.id, communityStoriesTable.author_user_id))
    .innerJoin(communityStoryMediaTable, eq(communityStoryMediaTable.story_id, communityStoriesTable.id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(and(
      eq(communityStoriesTable.status, "published"),
      eq(communityStoriesTable.audience, "community"),
      communityVisibility,
      sql`${communityStoriesTable.expires_at} > NOW()`,
      eq(communityStoryMediaTable.media_type, "video"),
      sql`${communityStoryMediaTable.mime_type} LIKE 'video/%'`,
      or(
        isNull(mediaAssetsTable.id),
        and(eq(mediaAssetsTable.status, "ready"), sql`${mediaAssetsTable.variant_key} IS NOT NULL`),
      ),
      eq(exchangeListingsTable.status, "active"),
      eq(exchangeListingsTable.moderation_status, "approved"),
      eq(exchangeListingsTable.seller_id, communityStoriesTable.author_user_id),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      locationCondition,
      sql`NOT EXISTS (
        SELECT 1 FROM direct_message_blocks spark_block
        WHERE (spark_block.blocker_id = ${userId} AND spark_block.blocked_id = ${communityStoriesTable.author_user_id})
           OR (spark_block.blocker_id = ${communityStoriesTable.author_user_id} AND spark_block.blocked_id = ${userId})
      )`,
      cursor
        ? or(
          lt(communityStoriesTable.created_at, new Date(cursor.created_at)),
          and(
            eq(communityStoriesTable.created_at, new Date(cursor.created_at)),
            lt(communityStoriesTable.id, cursor.id),
          ),
        )
        : undefined,
    ))
    .orderBy(desc(communityStoriesTable.created_at), desc(communityStoriesTable.id))
    .limit(pageSize + 1);
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  return res.json({
    sparks: pageRows.map((row) => ({
      listingId: row.listing_id,
      storyId: row.story_id,
      // Retain the Exchange client’s established snake-case identifiers while
      // exposing the canonical linked Story/listing keys for newer clients.
      id: row.story_id,
      listing_id: row.listing_id,
      caption: row.caption,
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
      neighborhood: row.neighborhood,
      media_url: `/api/community/stories/media/${row.media_id}`,
      thumbnail_url: row.thumbnail_storage_key || row.thumbnail_key
        ? `/api/community/stories/media/${row.media_id}?thumbnail=true`
        : null,
    })),
    next_cursor: hasMore ? encodeListingCursor({
      created_at: pageRows[pageRows.length - 1].created_at,
      id: pageRows[pageRows.length - 1].story_id,
    }) : null,
  });
});

function parseRadius(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
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
  pickup_location_type: exchangeListingsTable.pickup_location_type,
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
    if (req.query.radius_miles !== undefined && parseRadius(req.query.radius_miles) == null) {
      return res.status(400).json({ error: "radius_miles must be between 1 and 50" });
    }
    viewerLocation = await getExchangeMatchingLocation(userId);
  }

  let locationCondition:
    | ReturnType<typeof and>
    | ReturnType<typeof eq>
    | ReturnType<typeof sql>
    | undefined;
  if (nearby && viewerLocation?.lat != null && viewerLocation.lng != null
      && Number.isFinite(viewerLocation.lat) && Number.isFinite(viewerLocation.lng)) {
    const radius = req.query.radius_miles === undefined ? 15 : parseRadius(req.query.radius_miles)!;
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
  const isOwner = listing?.seller_id === req.authenticatedUserId;
  if (!listing || (!isOwner && (
    listing.status !== "active" || listing.moderation_status !== "approved"
  ))) {
    return res.status(404).json({ error: "Listing not found" });
  }
  return res.json({ listing: serializeListing(listing as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/listings", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const parsed = listingBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid listing", details: parsed.error.issues });
  const data = parsed.data;
  if (![data.title, data.description].every(safePublicListingArea)
    || !safePublicListingArea(data.neighborhood)
    || !safePublicListingArea(data.pickup_notes)) {
    return res.status(400).json({ error: "Use a neighborhood or public pickup area only. Do not include phone numbers, email addresses, links, or exact contact details." });
  }
  const moderation = moderatePostText(`${data.title}\n${data.description}\n${data.pickup_notes}`);
  const sellerLocation = await getExchangeMatchingLocation(req.authenticatedUserId!);
  const [listing] = await db.insert(exchangeListingsTable).values({
    seller_id: req.authenticatedUserId!,
    listing_type: data.listing_type,
    resource_type: data.resource_type,
    title: data.title,
    description: data.description,
    category: data.category,
    condition: data.condition,
    neighborhood: data.neighborhood,
    pickup_location_type: data.pickup_location_type,
    pickup_notes: data.pickup_notes || null,
    latitude: sellerLocation?.lat ?? null,
    longitude: sellerLocation?.lng ?? null,
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

router.patch("/community/exchange/listings/:id", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid listing id" });
  const parsed = listingEditBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid listing update", details: parsed.error.issues });
  const data = parsed.data;
  const [listing] = await db.select().from(exchangeListingsTable).where(and(
    eq(exchangeListingsTable.id, id),
    eq(exchangeListingsTable.seller_id, req.authenticatedUserId!),
  )).limit(1);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  if (listing.status !== "active") {
    return res.status(409).json({ error: "A listing can only be edited before pickup coordination is accepted." });
  }
  if (listing.moderation_status === "held") {
    return res.status(409).json({ error: "This listing is under safety review and cannot be edited until a moderator resolves the hold." });
  }
  if ([data.title, data.description]
    .filter((value): value is string => value !== undefined)
    .some((value) => !safePublicListingArea(value))) {
    return res.status(400).json({ error: "Use a neighborhood or public pickup area only. Do not include phone numbers, email addresses, links, or exact contact details." });
  }
  if ((data.neighborhood !== undefined && !safePublicListingArea(data.neighborhood))
    || (data.pickup_notes !== undefined && !safePublicListingArea(data.pickup_notes))) {
    return res.status(400).json({ error: "Use a neighborhood or public pickup area only. Do not include phone numbers, email addresses, links, or exact contact details." });
  }
  const nextTitle = data.title ?? listing.title;
  const nextDescription = data.description ?? listing.description;
  const nextPickupNotes = data.pickup_notes ?? listing.pickup_notes ?? "";
  const moderation = moderatePostText(`${nextTitle}\n${nextDescription}\n${nextPickupNotes}`);
  const updates = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Partial<typeof exchangeListingsTable.$inferInsert>;
  const now = new Date();
  const [updated] = await db.update(exchangeListingsTable)
    .set({
      ...updates,
      pickup_notes: data.pickup_notes === undefined ? undefined : data.pickup_notes || null,
      moderation_status: moderation.status,
      moderation_reason: moderation.reason,
      updated_at: now,
    })
    .where(and(
      eq(exchangeListingsTable.id, id),
      eq(exchangeListingsTable.seller_id, req.authenticatedUserId!),
      eq(exchangeListingsTable.status, "active"),
      eq(exchangeListingsTable.moderation_status, listing.moderation_status),
    ))
    .returning();
  if (!updated) return res.status(409).json({ error: "This listing changed before it could be edited." });

  const activeRequests = await db.select({
    id: exchangePickupRequestsTable.id,
    buyer_id: exchangePickupRequestsTable.buyer_id,
  }).from(exchangePickupRequestsTable).where(and(
    eq(exchangePickupRequestsTable.listing_id, id),
    eq(exchangePickupRequestsTable.status, "requested"),
  ));
  void Promise.allSettled(activeRequests.map((request) => notifyExchangeParticipant({
    recipientId: request.buyer_id,
    actorUserId: req.authenticatedUserId!,
    listingId: updated.id,
    pickupRequestId: request.id,
    title: "An Exchange post changed",
    body: `The owner updated “${safeListingLabel(updated.title)}”. Open Messages to review the current coordination details.`,
    action: "listing_updated",
  })));

  return res.json({
    listing: serializeListing(updated as unknown as Record<string, unknown>),
    message: moderation.status === "approved"
      ? "Listing updated."
      : "Listing updated and held for safety review.",
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

router.post("/community/exchange/listings/:id/renew", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid listing id" });
  const [listing] = await db.select().from(exchangeListingsTable).where(and(
    eq(exchangeListingsTable.id, id),
    eq(exchangeListingsTable.seller_id, req.authenticatedUserId!),
  )).limit(1);
  if (!listing) return res.status(404).json({ error: "Listing not found" });
  if (listing.status !== "archived") return res.status(409).json({ error: "Only an archived listing can be renewed." });
  if (listing.moderation_status !== "approved") return res.status(409).json({ error: "This listing needs safety review before it can be renewed." });
  const now = new Date();
  const [updated] = await db.update(exchangeListingsTable)
    .set({
      status: "active",
      archived_at: null,
      archive_reason: null,
      updated_at: now,
    })
    .where(and(eq(exchangeListingsTable.id, id), eq(exchangeListingsTable.status, "archived")))
    .returning();
  if (!updated) return res.status(409).json({ error: "This listing was already renewed." });
  void createMessageNotification({
    userId: updated.seller_id,
    type: "exchange",
    title: "Your Exchange post is active again",
    body: `“${safeListingLabel(updated.title)}” is visible to neighbors again.`,
    actionUrl: "/community?section=exchange&mine=true",
    metadata: { exchange_listing_id: updated.id, action: "renewed" },
  }).catch(() => {});
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
      pickup_location_type: exchangePickupRequestsTable.pickup_location_type,
      pickup_note: exchangePickupRequestsTable.pickup_note,
      proposed_window: exchangePickupRequestsTable.proposed_window,
      status: exchangePickupRequestsTable.status,
      buyer_confirmed_at: exchangePickupRequestsTable.buyer_confirmed_at,
      seller_confirmed_at: exchangePickupRequestsTable.seller_confirmed_at,
      accepted_at: exchangePickupRequestsTable.accepted_at,
      coordination_expires_at: exchangePickupRequestsTable.coordination_expires_at,
      cancelled_at: exchangePickupRequestsTable.cancelled_at,
      expired_at: exchangePickupRequestsTable.expired_at,
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
  const disputes = rows.length
    ? await db.select({
      pickup_request_id: exchangePickupDisputesTable.pickup_request_id,
      status: exchangePickupDisputesTable.status,
      outcome: exchangePickupDisputesTable.outcome,
      opened_at: exchangePickupDisputesTable.opened_at,
      resolved_at: exchangePickupDisputesTable.resolved_at,
      created_at: exchangePickupDisputesTable.created_at,
      updated_at: exchangePickupDisputesTable.updated_at,
    }).from(exchangePickupDisputesTable)
      .where(inArray(exchangePickupDisputesTable.pickup_request_id, rows.map((row) => row.id)))
      .orderBy(desc(exchangePickupDisputesTable.opened_at), desc(exchangePickupDisputesTable.id))
    : [];
  const latestDispute = new Map<number, typeof disputes[number]>();
  for (const dispute of disputes) {
    if (!latestDispute.has(dispute.pickup_request_id)) latestDispute.set(dispute.pickup_request_id, dispute);
  }
  return res.json({ pickup_requests: rows.map((row) => {
    const current = latestDispute.get(row.id);
    return {
      ...serializeListing(row as unknown as Record<string, unknown>) as Record<string, unknown>,
      dispute: current ? serializeListing({
        status: current.status,
        outcome: current.outcome,
        opened_at: current.opened_at,
        resolved_at: current.resolved_at,
        created_at: current.created_at,
        updated_at: current.updated_at,
      }) : null,
    };
  }) });
});

router.get("/community/exchange/disputes", requireAuth, requireAdmin(), generalApiLimiter, async (_req, res) => {
  const disputes = await db.select({
    id: exchangePickupDisputesTable.id,
    pickup_request_id: exchangePickupDisputesTable.pickup_request_id,
    listing_id: exchangeListingsTable.id,
    listing_title: exchangeListingsTable.title,
    opened_by: exchangePickupDisputesTable.opened_by,
    buyer_id: exchangePickupRequestsTable.buyer_id,
    seller_id: exchangeListingsTable.seller_id,
    reason: exchangePickupDisputesTable.reason,
    evidence: exchangePickupDisputesTable.evidence,
    status: exchangePickupDisputesTable.status,
    outcome: exchangePickupDisputesTable.outcome,
    resolution: exchangePickupDisputesTable.resolution,
    opened_at: exchangePickupDisputesTable.opened_at,
    resolved_at: exchangePickupDisputesTable.resolved_at,
  }).from(exchangePickupDisputesTable)
    .innerJoin(exchangePickupRequestsTable, eq(exchangePickupRequestsTable.id, exchangePickupDisputesTable.pickup_request_id))
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
    .where(eq(exchangePickupDisputesTable.status, "open"))
    .orderBy(desc(exchangePickupDisputesTable.opened_at))
    .limit(100);
  return res.json({ disputes: disputes.map((dispute) => serializeListing(dispute as unknown as Record<string, unknown>)) });
});

router.post("/community/exchange/listings/:id/pickup-requests", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const listingId = parseId(req.params.id);
  if (!listingId) return res.status(400).json({ error: "Invalid listing id" });
  const parsed = pickupBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid pickup request", details: parsed.error.issues });
  if (!safePublicListingArea(parsed.data.note)
    || !safePublicListingArea(parsed.data.pickup_area)
    || !safePublicListingArea(parsed.data.pickup_note ?? "")
    || !safePublicListingArea(parsed.data.proposed_window)) {
    return res.status(400).json({ error: "Keep pickup coordination inside Niakofa and use a coarse public area. Do not include phone numbers, email addresses, links, exact addresses, or coordinates." });
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
  let pickupRequest: typeof exchangePickupRequestsTable.$inferSelect;
  try {
    // The partial unique index is the concurrency guard. The preflight query
    // above is only a friendly fast path; two requests can still arrive
    // simultaneously and one must become a controlled 409, not a 500.
    const inserted = await db.transaction(async (tx) => {
      // A request and stale-listing archival must serialize on the listing.
      // Refreshing updated_at makes a waiting archival UPDATE ineligible even
      // if it started with a snapshot from before this request committed.
      const [available] = await tx.select().from(exchangeListingsTable)
        .where(eq(exchangeListingsTable.id, listingId)).for("update").limit(1);
      if (!available || available.status !== "active" || available.moderation_status !== "approved") return null;
      await tx.update(exchangeListingsTable).set({ updated_at: new Date() })
        .where(eq(exchangeListingsTable.id, listingId));
      const [created] = await tx.insert(exchangePickupRequestsTable).values({
        listing_id: listingId,
        buyer_id: userId,
        note: parsed.data.note,
        pickup_area: parsed.data.pickup_area,
        pickup_location_type: parsed.data.pickup_location_type,
        pickup_note: parsed.data.pickup_note || null,
        proposed_window: parsed.data.proposed_window,
      }).returning();
      return created ?? null;
    });
    if (!inserted) return res.status(404).json({ error: "Listing is not available." });
    pickupRequest = inserted;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "You already have a pickup request for this listing." });
    }
    throw error;
  }
  void notifyExchangeParticipant({
    recipientId: listing.seller_id,
    actorUserId: userId,
    listingId: listing.id,
    pickupRequestId: pickupRequest.id,
    title: "A neighbor wants to coordinate",
    body: `Someone responded to “${safeListingLabel(listing.title)}”. Open Messages to review the request.`,
    action: "request_created",
  }).catch(() => {});
  void sendPushToUser(listing.seller_id, {
    title: "A neighbor wants to coordinate",
    body: `Someone responded to “${safeListingLabel(listing.title)}”. Open Exchange to review the request.`,
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
      coordination_expires_at: exchangePickupRequestsTable.coordination_expires_at,
      expired_at: exchangePickupRequestsTable.expired_at,
    seller_id: exchangeListingsTable.seller_id,
    listing_status: exchangeListingsTable.status,
  }).from(exchangePickupRequestsTable)
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
    .where(eq(exchangePickupRequestsTable.id, id)).limit(1);
  return row ?? null;
}

router.post("/community/exchange/pickup-requests/:id/dispute", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const parsed = disputeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid dispute", details: parsed.error.issues });
  if (!safePublicListingArea(parsed.data.reason)
    || !safePublicListingArea(parsed.data.evidence ?? "")) {
    return res.status(400).json({ error: "Dispute details must not include phone numbers, email addresses, links, exact addresses, or coordinates." });
  }
  const userId = req.authenticatedUserId!;
  type OpenDisputeResult =
    | { error: string; status: 403 | 404 | 409 }
    | { dispute: typeof exchangePickupDisputesTable.$inferSelect; pickup: typeof exchangePickupRequestsTable.$inferSelect; sellerId: number };
  let result: OpenDisputeResult;
  try {
    result = await db.transaction(async (tx): Promise<OpenDisputeResult> => {
      // All lifecycle transitions acquire request then listing to avoid a
      // dispute racing confirmation, cancellation, or the expiry worker.
      const [pickup] = await tx.select().from(exchangePickupRequestsTable)
        .where(eq(exchangePickupRequestsTable.id, id)).for("update").limit(1);
      if (!pickup) return { error: "Pickup request not found", status: 404 as const };
      const [listing] = await tx.select({
        seller_id: exchangeListingsTable.seller_id,
        status: exchangeListingsTable.status,
      }).from(exchangeListingsTable)
        .where(eq(exchangeListingsTable.id, pickup.listing_id)).for("update").limit(1);
      if (!listing) return { error: "Listing not found", status: 404 as const };
      if (pickup.buyer_id !== userId && listing?.seller_id !== userId) {
        return { error: "Only an accepted pickup participant can open a dispute.", status: 403 as const };
      }
      if (pickup.status !== "accepted" || listing?.status !== "reserved") {
        return { error: "A dispute can only be opened for an accepted pickup.", status: 409 as const };
      }
      const now = new Date();
      if (pickup.coordination_expires_at && pickup.coordination_expires_at <= now) {
        return { error: "The 48-hour coordination window has expired; this pickup can no longer be disputed.", status: 409 as const };
      }
      const [dispute] = await tx.insert(exchangePickupDisputesTable).values({
        pickup_request_id: pickup.id,
        opened_by: userId,
        reason: parsed.data.reason,
        evidence: parsed.data.evidence || null,
        opened_at: now,
        created_at: now,
        updated_at: now,
      }).returning();
      const [updatedPickup] = await tx.update(exchangePickupRequestsTable)
        .set({ status: "disputed", updated_at: now })
        .where(and(
          eq(exchangePickupRequestsTable.id, pickup.id),
          eq(exchangePickupRequestsTable.status, "accepted"),
        )).returning();
      if (!updatedPickup) throw new Error("EXCHANGE_DISPUTE_PICKUP_CONFLICT");
      return { dispute, pickup: updatedPickup, sellerId: listing.seller_id };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "An active dispute already exists for this pickup." });
    }
    if (error instanceof Error && error.message === "EXCHANGE_DISPUTE_PICKUP_CONFLICT") {
      return res.status(409).json({ error: "This pickup changed before the dispute could be opened." });
    }
    throw error;
  }
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  const participants = [result.pickup.buyer_id, result.sellerId];
  void Promise.allSettled(participants.map((recipientId) => notifyExchangeParticipant({
    recipientId,
    actorUserId: userId,
    listingId: result.pickup.listing_id,
    pickupRequestId: result.pickup.id,
    title: "An Exchange pickup is under dispute",
    body: "A participant opened a dispute. The pickup is on hold while the safety team reviews it.",
    action: "dispute_opened",
  })));
  return res.status(201).json({
    pickup_request: serializeListing(result.pickup as unknown as Record<string, unknown>),
    dispute: serializeListing(result.dispute as unknown as Record<string, unknown>),
  });
});

router.post("/community/exchange/pickup-requests/:id/resolve-dispute", requireAuth, requireAdmin(), generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const parsed = resolveDisputeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid dispute resolution", details: parsed.error.issues });
  if (!safePublicListingArea(parsed.data.resolution)) {
    return res.status(400).json({ error: "Resolution must not include phone numbers, email addresses, links, exact addresses, or coordinates." });
  }
  const moderatorId = req.authenticatedUserId!;
  type ResolveDisputeResult =
    | { error: string; status: 404 | 409 }
    | { dispute: typeof exchangePickupDisputesTable.$inferSelect; pickup: typeof exchangePickupRequestsTable.$inferSelect; buyerId: number; sellerId: number; listingAvailableAgain: boolean };
  const result = await db.transaction(async (tx): Promise<ResolveDisputeResult> => {
    const [pickup] = await tx.select().from(exchangePickupRequestsTable)
      .where(eq(exchangePickupRequestsTable.id, id)).for("update").limit(1);
    if (!pickup) return { error: "Pickup request not found", status: 404 as const };
    const [listing] = await tx.select({
      seller_id: exchangeListingsTable.seller_id,
      status: exchangeListingsTable.status,
      moderation_status: exchangeListingsTable.moderation_status,
    }).from(exchangeListingsTable)
      .where(eq(exchangeListingsTable.id, pickup.listing_id)).for("update").limit(1);
    const [dispute] = await tx.select().from(exchangePickupDisputesTable)
      .where(and(
        eq(exchangePickupDisputesTable.pickup_request_id, pickup.id),
        eq(exchangePickupDisputesTable.status, "open"),
      )).for("update").limit(1);
    if (!dispute || pickup.status !== "disputed") {
      return { error: "There is no active dispute for this pickup.", status: 409 as const };
    }
    if (!listing) return { error: "Listing not found", status: 404 as const };
    if (listing.status !== "reserved") {
      return { error: "The held listing state changed; this dispute cannot be resolved safely.", status: 409 as const };
    }
    const now = new Date();
    const [resolved] = await tx.update(exchangePickupDisputesTable)
      .set({
        status: "resolved",
        outcome: parsed.data.outcome,
        resolution: parsed.data.resolution,
        resolved_by: moderatorId,
        resolved_at: now,
        updated_at: now,
      }).where(and(
        eq(exchangePickupDisputesTable.id, dispute.id),
        eq(exchangePickupDisputesTable.status, "open"),
      )).returning();
    if (!resolved) return { error: "This dispute was already resolved.", status: 409 as const };
    const [updatedPickup] = await tx.update(exchangePickupRequestsTable)
      .set(parsed.data.outcome === "complete"
        ? { status: "completed", completed_at: now, updated_at: now }
        : { status: "cancelled", cancelled_at: now, updated_at: now })
      .where(and(
        eq(exchangePickupRequestsTable.id, pickup.id),
        eq(exchangePickupRequestsTable.status, "disputed"),
      )).returning();
    if (!updatedPickup) throw new Error("EXCHANGE_DISPUTE_RESOLUTION_CONFLICT");
    const listingUpdate = parsed.data.outcome === "complete"
      ? { status: "completed", updated_at: now }
      : listing.moderation_status === "approved"
        ? { status: "active", archived_at: null, archive_reason: null, updated_at: now }
        : {
          status: "archived",
          archived_at: now,
          archive_reason: "pickup_dispute_cancelled_while_listing_unapproved",
          updated_at: now,
        };
    const [updatedListing] = await tx.update(exchangeListingsTable)
      .set(listingUpdate)
      .where(and(
        eq(exchangeListingsTable.id, pickup.listing_id),
        eq(exchangeListingsTable.status, "reserved"),
        eq(exchangeListingsTable.moderation_status, listing.moderation_status),
      )).returning({ id: exchangeListingsTable.id });
    if (!updatedListing) throw new Error("EXCHANGE_DISPUTE_LISTING_CONFLICT");
    return {
      dispute: resolved,
      pickup: updatedPickup,
      buyerId: pickup.buyer_id,
      sellerId: listing.seller_id,
      listingAvailableAgain: parsed.data.outcome === "cancel" && listing.moderation_status === "approved",
    };
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  const participants = [result.buyerId, result.sellerId];
  void Promise.allSettled(participants.map((recipientId) => notifyExchangeParticipant({
    recipientId,
    actorUserId: moderatorId,
    listingId: result.pickup.listing_id,
    pickupRequestId: result.pickup.id,
    title: parsed.data.outcome === "complete" ? "Exchange dispute resolved" : "Exchange pickup dispute resolved",
    body: parsed.data.outcome === "complete"
      ? "The moderator resolved this pickup as complete."
      : result.listingAvailableAgain
        ? "The moderator cancelled this pickup. The approved listing is available again."
        : "The moderator cancelled this pickup. The listing remains archived and hidden; its owner can renew it after safety approval.",
    action: "dispute_resolved",
  })));
  return res.json({
    pickup_request: serializeListing(result.pickup as unknown as Record<string, unknown>),
    dispute: serializeListing(result.dispute as unknown as Record<string, unknown>),
  });
});

type AcceptPickupResult =
  | { error: string; status: 403 | 404 | 409 }
  | { pickup_request: typeof exchangePickupRequestsTable.$inferSelect };

router.post("/community/exchange/pickup-requests/:id/accept", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const userId = req.authenticatedUserId!;
  const result = await db.transaction(async (tx): Promise<AcceptPickupResult> => {
    // Lock the request before the listing; cancellation, completion and
    // maintenance use the same order so neither transition can strand a hold.
    const [pickup] = await tx.select().from(exchangePickupRequestsTable)
      .where(eq(exchangePickupRequestsTable.id, id)).for("update").limit(1);
    if (!pickup) return { error: "Pickup request not found", status: 404 as const };
    const [currentListing] = await tx.select({
      seller_id: exchangeListingsTable.seller_id,
      status: exchangeListingsTable.status,
      moderation_status: exchangeListingsTable.moderation_status,
    }).from(exchangeListingsTable).where(eq(exchangeListingsTable.id, pickup.listing_id)).for("update").limit(1);
    if (currentListing?.seller_id !== userId) return { error: "Only the seller can accept this request.", status: 403 as const };
    if (pickup.status !== "requested" || currentListing.status !== "active" || currentListing.moderation_status !== "approved") {
      return { error: "This request is no longer available to accept.", status: 409 as const };
    }
    const acceptedAt = new Date();
    const [updated] = await tx.update(exchangePickupRequestsTable)
      .set({
        status: "accepted",
        accepted_at: acceptedAt,
        coordination_expires_at: new Date(acceptedAt.getTime() + EXCHANGE_PICKUP_COORDINATION_HOURS * 60 * 60 * 1000),
        updated_at: acceptedAt,
      })
      .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "requested"))).returning();
    if (!updated) return { error: "This pickup request was already changed.", status: 409 as const };
    const [listing] = await tx.update(exchangeListingsTable)
      .set({ status: "reserved", updated_at: acceptedAt })
      .where(and(
        eq(exchangeListingsTable.id, pickup.listing_id),
        eq(exchangeListingsTable.status, "active"),
        eq(exchangeListingsTable.moderation_status, "approved"),
      )).returning({ id: exchangeListingsTable.id });
    if (!listing) {
      // A return would commit the accepted request. Throw to roll back both
      // writes if another acceptance or moderation hold won the listing.
      throw new Error("EXCHANGE_LISTING_RESERVATION_CONFLICT");
    }
    return { pickup_request: updated };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "EXCHANGE_LISTING_RESERVATION_CONFLICT") {
      return { error: "Another pickup request was accepted first, or the listing is under review.", status: 409 as const };
    }
    throw error;
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  void notifyExchangeParticipant({
    recipientId: result.pickup_request.buyer_id,
    actorUserId: userId,
    listingId: result.pickup_request.listing_id,
    pickupRequestId: result.pickup_request.id,
    title: "Your Exchange request was accepted",
    body: `Your neighbor accepted the coordination request. Continue the handoff in Messages within ${EXCHANGE_PICKUP_COORDINATION_HOURS} hours.`,
    action: "request_accepted",
  }).catch(() => {});
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
  if (!updated) return res.status(409).json({ error: "This request was already changed." });
  void notifyExchangeParticipant({
    recipientId: updated.buyer_id,
    actorUserId: req.authenticatedUserId!,
    listingId: pickup.listing_id,
    pickupRequestId: updated.id,
    title: "Your Exchange request was declined",
    body: "This coordination request was declined. Open Messages for the update, or browse Exchange for another neighbor.",
    action: "request_declined",
  }).catch(() => {});
  void sendPushToUser(updated.buyer_id, {
    title: "Your Exchange request was declined",
    body: "This coordination request was declined. You can browse Exchange for other ways to connect with a neighbor.",
    notifType: "task_accepted",
  }).catch(() => {});
  return res.json({ pickup_request: serializeListing(updated as unknown as Record<string, unknown>) });
});

router.post("/community/exchange/pickup-requests/:id/cancel", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  type CancelPickupResult =
    | { error: string; status: 403 | 404 | 409 }
    | { pickup_request: typeof exchangePickupRequestsTable.$inferSelect; otherParticipantId: number; listingAvailableAgain: boolean };
  const result = await db.transaction(async (tx): Promise<CancelPickupResult> => {
    const [pickup] = await tx.select().from(exchangePickupRequestsTable)
      .where(eq(exchangePickupRequestsTable.id, id)).for("update").limit(1);
    if (!pickup) return { error: "Pickup request not found", status: 404 as const };
    const [listing] = await tx.select({
      seller_id: exchangeListingsTable.seller_id,
      status: exchangeListingsTable.status,
      moderation_status: exchangeListingsTable.moderation_status,
    })
      .from(exchangeListingsTable).where(eq(exchangeListingsTable.id, pickup.listing_id)).for("update").limit(1);
    if (!listing) return { error: "Listing not found", status: 404 as const };
    if (pickup.buyer_id !== req.authenticatedUserId && listing?.seller_id !== req.authenticatedUserId) {
      return { error: "Only the pickup participants can cancel.", status: 403 as const };
    }
    if (!["requested", "accepted"].includes(pickup.status)) {
      return { error: "This pickup cannot be cancelled.", status: 409 as const };
    }
    if (pickup.status === "accepted" && listing.status !== "reserved") {
      return { error: "The reserved listing state changed; this pickup cannot be cancelled safely.", status: 409 as const };
    }
    const now = new Date();
    const [updated] = await tx.update(exchangePickupRequestsTable)
      .set({ status: "cancelled", cancelled_at: now, updated_at: now })
      .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, pickup.status))).returning();
    if (!updated) return { error: "This pickup was already changed.", status: 409 as const };
    let listingAvailableAgain = pickup.status === "requested"
      && listing.status === "active"
      && listing.moderation_status === "approved";
    if (pickup.status === "accepted") {
      const approved = listing.moderation_status === "approved";
      const [updatedListing] = await tx.update(exchangeListingsTable)
        .set(approved
          ? { status: "active", archived_at: null, archive_reason: null, updated_at: now }
          : {
            status: "archived",
            archived_at: now,
            archive_reason: "pickup_cancelled_while_listing_unapproved",
            updated_at: now,
          })
        .where(and(
          eq(exchangeListingsTable.id, pickup.listing_id),
          eq(exchangeListingsTable.status, "reserved"),
          eq(exchangeListingsTable.moderation_status, listing.moderation_status),
        )).returning({ id: exchangeListingsTable.id });
      if (!updatedListing) throw new Error("EXCHANGE_CANCEL_LISTING_CONFLICT");
      listingAvailableAgain = approved;
    }
    return {
      pickup_request: updated,
      otherParticipantId: req.authenticatedUserId === pickup.buyer_id ? listing.seller_id : pickup.buyer_id,
      listingAvailableAgain,
    };
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  const otherParticipantId = result.otherParticipantId;
  void notifyExchangeParticipant({
    recipientId: otherParticipantId,
    actorUserId: req.authenticatedUserId!,
    listingId: result.pickup_request.listing_id,
    pickupRequestId: result.pickup_request.id,
    title: "Exchange coordination was cancelled",
    body: "The other participant cancelled this pickup coordination. Open Messages for the update.",
    action: "request_cancelled",
  }).catch(() => {});
  void sendPushToUser(otherParticipantId, {
    title: "Exchange coordination was cancelled",
    body: result.listingAvailableAgain
      ? "The other participant cancelled this pickup coordination. The approved listing is available again."
      : "The other participant cancelled this pickup coordination. Listing visibility remains subject to safety review; if archived, its owner can renew it after approval.",
    notifType: "task_accepted",
  }).catch(() => {});
  return res.json({ pickup_request: serializeListing(result.pickup_request as unknown as Record<string, unknown>) });
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
    const [pickup] = await tx.select().from(exchangePickupRequestsTable)
      .where(eq(exchangePickupRequestsTable.id, id))
      .for("update")
      .limit(1);
    if (!pickup) return { error: "Pickup request not found", status: 404 as const };
    const [listing] = await tx.select({
      seller_id: exchangeListingsTable.seller_id,
      status: exchangeListingsTable.status,
      moderation_status: exchangeListingsTable.moderation_status,
    })
      .from(exchangeListingsTable).where(eq(exchangeListingsTable.id, pickup.listing_id)).for("update").limit(1);
    if (!listing) return { error: "Listing not found", status: 404 as const };
    const isBuyer = pickup.buyer_id === userId;
    const isSeller = listing?.seller_id === userId;
    if (!isBuyer && !isSeller) return { error: "Only the pickup participants can confirm completion.", status: 403 as const };
    if (pickup.status !== "accepted") return { error: "Completion can only be confirmed for an accepted pickup.", status: 409 as const };
    if (listing.status !== "reserved") return { error: "The reserved listing state changed; completion cannot be confirmed safely.", status: 409 as const };
    if (isBuyer ? pickup.buyer_confirmed_at : pickup.seller_confirmed_at) {
      return { error: "Your handoff confirmation was already recorded.", status: 409 as const };
    }
    const now = new Date();
    if (pickup.coordination_expires_at && pickup.coordination_expires_at <= now) {
      return { error: "The coordination window expired. This listing will be available again shortly.", status: 409 as const };
    }
    const [updated] = await tx.update(exchangePickupRequestsTable).set(
      isBuyer ? { buyer_confirmed_at: now, updated_at: now } : { seller_confirmed_at: now, updated_at: now },
    ).where(eq(exchangePickupRequestsTable.id, id)).returning();
    if (!updated) return { error: "This pickup was already changed.", status: 409 as const };
    if (updated.buyer_confirmed_at && updated.seller_confirmed_at) {
      const [completed] = await tx.update(exchangePickupRequestsTable)
        .set({ status: "completed", completed_at: now, updated_at: now })
        .where(and(eq(exchangePickupRequestsTable.id, id), eq(exchangePickupRequestsTable.status, "accepted")))
        .returning();
      if (!completed) throw new Error("EXCHANGE_CONFIRM_PICKUP_CONFLICT");
      const [completedListing] = await tx.update(exchangeListingsTable)
        .set({ status: "completed", updated_at: now })
        .where(and(
          eq(exchangeListingsTable.id, pickup.listing_id),
          eq(exchangeListingsTable.status, "reserved"),
          eq(exchangeListingsTable.moderation_status, listing.moderation_status),
        )).returning({ id: exchangeListingsTable.id });
      if (!completedListing) throw new Error("EXCHANGE_CONFIRM_LISTING_CONFLICT");
      return {
        pickup_request: completed,
        notifyUserIds: [pickup.buyer_id, listing.seller_id],
      };
    }
    return {
      pickup_request: updated,
      awaiting_other_confirmation: true as const,
      notifyUserIds: [isBuyer ? listing.seller_id : pickup.buyer_id],
    };
  });
  if ("error" in result) return res.status(result.status).json({ error: result.error });
  if (result.notifyUserIds.length > 0) {
    const otherParticipantId = result.notifyUserIds.find((participantId) => participantId !== userId);
    if (otherParticipantId) {
      void notifyExchangeParticipant({
        recipientId: otherParticipantId,
        actorUserId: userId,
        listingId: result.pickup_request.listing_id,
        pickupRequestId: result.pickup_request.id,
        title: result.awaiting_other_confirmation ? "Exchange handoff confirmation recorded" : "Exchange handoff completed",
        body: result.awaiting_other_confirmation
          ? "The other participant confirmed their side. Continue the handoff in Messages."
          : "Both participants confirmed the handoff. Thank you for closing the loop.",
        action: result.awaiting_other_confirmation ? "handoff_confirmation_recorded" : "handoff_completed",
      }).catch(() => {});
    }
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
    completed: sql<number>`COUNT(*) FILTER (WHERE ${exchangePickupRequestsTable.status} = 'completed' AND ${exchangePickupRequestsTable.buyer_confirmed_at} IS NOT NULL AND ${exchangePickupRequestsTable.seller_confirmed_at} IS NOT NULL)::int`,
    unique_neighbors: sql<number>`COUNT(DISTINCT CASE WHEN ${exchangePickupRequestsTable.status} = 'completed' AND ${exchangePickupRequestsTable.buyer_confirmed_at} IS NOT NULL AND ${exchangePickupRequestsTable.seller_confirmed_at} IS NOT NULL THEN ${exchangePickupRequestsTable.buyer_id} END)::int`,
    last_30_days: sql<number>`COUNT(*) FILTER (WHERE ${exchangePickupRequestsTable.status} = 'completed' AND ${exchangePickupRequestsTable.buyer_confirmed_at} IS NOT NULL AND ${exchangePickupRequestsTable.seller_confirmed_at} IS NOT NULL AND ${exchangePickupRequestsTable.completed_at} >= NOW() - INTERVAL '30 days')::int`,
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

  // Three unique authenticated reports create a temporary review hold rather
  // than deleting or withdrawing the listing. The listing lifecycle and any
  // accepted pickup history remain intact while moderators investigate.
  const [openReports] = await db.select({
    count: sql<number>`COUNT(*)::int`,
  }).from(reportsTable).where(and(
    eq(reportsTable.reported_exchange_listing_id, listingId),
    sql`${reportsTable.status} IN ('pending', 'under_review')`,
  ));
  let held = false;
  if ((openReports?.count ?? 0) >= EXCHANGE_HOLD_REPORT_THRESHOLD) {
    const [heldListing] = await db.update(exchangeListingsTable)
      .set({
        moderation_status: "held",
        moderation_reason: "temporary_hold_after_three_unique_reports",
        moderation_hold_at: new Date(),
        moderation_hold_reason: "Three unique reports are awaiting moderator review.",
      })
      .where(and(
        eq(exchangeListingsTable.id, listingId),
        eq(exchangeListingsTable.moderation_status, "approved"),
      ))
      .returning({ id: exchangeListingsTable.id });
    held = Boolean(heldListing);
    if (held) {
      void createMessageNotification({
        userId: listing.seller_id,
        type: "exchange",
        title: "Your Exchange post is temporarily on hold",
        body: `“${listing.title}” is temporarily hidden while the safety team reviews community reports. Active pickup history is preserved.`,
        actionUrl: "/community?section=exchange&mine=true",
        metadata: { exchange_listing_id: listingId, action: "temporary_hold" },
      }).catch(() => {});
    }
  }

  return res.status(201).json({
    report_id: report.id,
    held,
    message: held
      ? "Thanks. The listing is temporarily held for safety review."
      : "Thanks. The listing has been sent to the safety team.",
  });
});

export default router;