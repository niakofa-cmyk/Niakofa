import { Router } from "express";
import { exchangeAccountsAreActive, lockExchangeAccounts } from "../lib/exchange-account-lifecycle";
import { and, asc, desc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import {
  db,
  directMessageBlocksTable,
  exchangeListingMediaTable,
  exchangeListingsTable,
  exchangePickupRequestsTable,
  exchangeSparksTable,
  communityStoriesTable,
  communityStoryMediaTable,
  mediaAssetsTable,
  mediaProcessingJobsTable,
  reportsTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter, communityPostLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { logger } from "../lib/logger";
import { deleteAssetStrict } from "../lib/storage";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { mediaStorageKeys } from "../lib/media-cleanup";
import { sendPushToUser } from "./push";
import { createMessageNotification } from "../lib/message-notifications";
import {
  exchangeNearbyCondition,
  exchangeSpatialIndexReady,
  getExchangeMatchingLocation,
} from "../lib/exchange-location";
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
const EXCHANGE_LISTING_MEDIA_LIMIT = 6;
const EXCHANGE_LISTING_VIDEO_LIMIT = 1;
const EXCHANGE_LISTING_VIDEO_MAX_DURATION_MS = 180_000;
const EXCHANGE_LISTING_MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
]);
const listingMediaAssetIdsSchema = z.array(z.number().int().positive())
  .max(EXCHANGE_LISTING_MEDIA_LIMIT)
  .refine((ids) => new Set(ids).size === ids.length, "A media asset can only be attached once.");

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
  media_asset_ids: listingMediaAssetIdsSchema.optional().default([]),
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
  media_asset_ids: listingMediaAssetIdsSchema.optional(),
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

async function notifyExchangeParticipant(input: {
  recipientId: number;
  actorUserId: number;
  listingId: number;
  pickupRequestId?: number;
  title: string;
  body: string;
  action?: string;
}): Promise<void> {
  let peerId = input.actorUserId;
  if (input.pickupRequestId) {
    const [pair] = await db.select({
      buyer_id: exchangePickupRequestsTable.buyer_id,
      seller_id: exchangeListingsTable.seller_id,
    }).from(exchangePickupRequestsTable)
      .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangePickupRequestsTable.listing_id))
      .where(and(eq(exchangePickupRequestsTable.id, input.pickupRequestId), eq(exchangeListingsTable.id, input.listingId)))
      .limit(1);
    if (!pair || ![pair.buyer_id, pair.seller_id].includes(input.recipientId)) {
      throw new Error("Exchange notification recipient is not a participant.");
    }
    peerId = input.recipientId === pair.buyer_id ? pair.seller_id : pair.buyer_id;
  }
  return createMessageNotification({
    userId: input.recipientId,
    actorUserId: input.actorUserId,
    type: "exchange",
    title: input.title,
    body: input.body,
    actionUrl: exchangeMessagesActionUrl(peerId, input.listingId, input.pickupRequestId),
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

type ExchangeListingMediaAssetForBinding = {
  id: number;
  owner_user_id: number;
  context_kind: string;
  context_id: number;
  media_type: string;
  mime_type: string;
  byte_size: number;
  duration_ms: number | null;
  status: string;
  metadata: Record<string, unknown> | null;
};

type ExchangeListingMediaView = {
  media_asset_id: number;
  media_type: "photo" | "video";
  mime_type: string;
  status: string;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  thumbnail_url: string | null;
  media_url: string | null;
};

function validateListingMediaSet(
  assets: ExchangeListingMediaAssetForBinding[],
  requestedIds: number[],
  ownerId: number,
  existingAssetIds: Set<number> = new Set(),
  listingId?: number,
): string | null {
  if (assets.length !== requestedIds.length) return "One or more media files are unavailable or belong to another account.";
  if (assets.filter((asset) => asset.media_type === "video").length > EXCHANGE_LISTING_VIDEO_LIMIT) {
    return "A post can include up to one short video.";
  }
  for (const asset of assets) {
    if (asset.owner_user_id !== ownerId) return "One or more media files are unavailable or belong to another account.";
    if (!["photo", "video"].includes(asset.media_type)
      || !EXCHANGE_LISTING_MEDIA_MIME_TYPES.has(asset.mime_type)
      || asset.media_type === "photo" && !asset.mime_type.startsWith("image/")
      || asset.media_type === "video" && !asset.mime_type.startsWith("video/")
      || asset.byte_size < 1 || asset.byte_size > 64 * 1024 * 1024) {
      return "Only JPEG, PNG, GIF, or WebP photos and MP4 or WebM videos up to 64 MiB are supported.";
    }
    if (asset.media_type === "video" && asset.duration_ms !== null
      && asset.duration_ms > EXCHANGE_LISTING_VIDEO_MAX_DURATION_MS) {
      return "Exchange videos must be 180 seconds or shorter.";
    }
    const isExisting = existingAssetIds.has(asset.id);
    const validContext = isExisting
      ? asset.context_kind === "exchange_listing" && asset.context_id === listingId
      : asset.context_kind === "exchange_listing_draft" && asset.context_id === ownerId;
    const validStatus = isExisting
      ? ["processing", "ready", "failed"].includes(asset.status)
      : ["processing", "ready"].includes(asset.status);
    if (!validContext || !validStatus || asset.metadata?.["signature_validated"] !== true) {
      return "One or more media files are still uploading or could not be verified. Remove them and try again.";
    }
  }
  return null;
}

async function getListingMedia(
  listings: Array<{ id: number; seller_id: number; status: string; moderation_status: string }>,
  viewerId: number,
): Promise<Map<number, ExchangeListingMediaView[]>> {
  const result = new Map<number, ExchangeListingMediaView[]>();
  if (!listings.length || !isMediaPlatformV21Enabled()) return result;

  const rows = await db.select({
    listing_id: exchangeListingMediaTable.listing_id,
    media_asset_id: mediaAssetsTable.id,
    media_type: mediaAssetsTable.media_type,
    mime_type: mediaAssetsTable.mime_type,
    status: mediaAssetsTable.status,
    duration_ms: mediaAssetsTable.duration_ms,
    width: mediaAssetsTable.width,
    height: mediaAssetsTable.height,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
  }).from(exchangeListingMediaTable)
    .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, exchangeListingMediaTable.media_asset_id))
    .where(and(
      inArray(exchangeListingMediaTable.listing_id, listings.map((listing) => listing.id)),
      ne(mediaAssetsTable.status, "deleted"),
    ))
    .orderBy(asc(exchangeListingMediaTable.listing_id), asc(exchangeListingMediaTable.position));

  const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
  for (const row of rows) {
    if (row.media_type !== "photo" && row.media_type !== "video") continue;
    const listing = listingsById.get(row.listing_id);
    if (!listing) continue;
    const isOwner = listing.seller_id === viewerId;
    const isPublicApproved = listing.status === "active" && listing.moderation_status === "approved";
    if (!isOwner && !isPublicApproved) continue;
    if (!isOwner && row.status !== "ready") continue;
    if (row.status !== "ready" && !isOwner) continue;
    const items = result.get(row.listing_id) ?? [];
    items.push({
      media_asset_id: row.media_asset_id,
      media_type: row.media_type === "video" ? "video" : "photo",
      mime_type: row.mime_type,
      status: row.status,
      duration_ms: row.duration_ms,
      width: row.width,
      height: row.height,
      thumbnail_url: row.status === "ready" && row.thumbnail_key
        ? `/api/media-assets/${row.media_asset_id}/thumbnail`
        : null,
      media_url: row.status === "ready" ? `/api/media-assets/${row.media_asset_id}` : null,
    });
    result.set(row.listing_id, items);
  }
  return result;
}

async function serializeListingWithMedia(
  listing: { id: number; seller_id: number; status: string; moderation_status: string } & Record<string, unknown>,
  viewerId: number,
): Promise<Record<string, unknown>> {
  const media = await getListingMedia([listing], viewerId);
  return serializeListing({ ...listing, media: media.get(listing.id) ?? [] });
}

async function cleanupDeletedListingMedia(assetIds: number[]): Promise<void> {
  for (const id of assetIds) {
    const [processingJob] = await db.select({ id: mediaProcessingJobsTable.id })
      .from(mediaProcessingJobsTable)
      .where(and(
        eq(mediaProcessingJobsTable.media_asset_id, id),
        eq(mediaProcessingJobsTable.status, "processing"),
      ))
      .limit(1);
    if (processingJob) continue;
    const [asset] = await db.select({
      id: mediaAssetsTable.id,
      original_key: mediaAssetsTable.original_key,
      thumbnail_key: mediaAssetsTable.thumbnail_key,
      variant_key: mediaAssetsTable.variant_key,
      cleanup_keys: mediaAssetsTable.cleanup_keys,
      metadata: mediaAssetsTable.metadata,
    }).from(mediaAssetsTable).where(and(
      eq(mediaAssetsTable.id, id),
      eq(mediaAssetsTable.status, "deleted"),
      sql`${mediaAssetsTable.metadata}->>'storage_cleanup_pending' = 'true'`,
    )).limit(1);
    if (!asset) continue;
    try {
      for (const key of mediaStorageKeys(asset)) await deleteAssetStrict(key);
      await db.update(mediaAssetsTable).set({
        metadata: sql`jsonb_set(${mediaAssetsTable.metadata}, '{storage_cleanup_pending}', 'false'::jsonb, true)`,
        updated_at: new Date(),
      }).where(and(eq(mediaAssetsTable.id, id), eq(mediaAssetsTable.status, "deleted")));
    } catch (error) {
      logger.warn({ errorName: error instanceof Error ? error.name : typeof error, mediaAssetId: id }, "Exchange listing media cleanup will retry");
    }
  }
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

type SparkCursor = ListingCursor & { source: "durable" | "legacy" };

function decodeSparkCursor(value: unknown): SparkCursor | null {
  const base = decodeListingCursor(value);
  if (!base) return null;
  try {
    const payload = JSON.parse(Buffer.from(value as string, "base64url").toString("utf8")) as { source?: unknown };
    if (payload.source !== undefined && payload.source !== "durable" && payload.source !== "legacy") return null;
    // Cursors issued before the durable feed existed only address legacy Stories.
    return { ...base, source: payload.source === "durable" ? "durable" : "legacy" };
  } catch {
    return null;
  }
}

function encodeSparkCursor(cursor: { created_at: Date; id: number; source: SparkCursor["source"] }): string {
  return Buffer.from(JSON.stringify({
    created_at: cursor.created_at.toISOString(),
    id: cursor.id,
    source: cursor.source,
  })).toString("base64url");
}

router.get("/community/exchange/sparks", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const [viewer] = await db.select({ community_id: usersTable.community_id })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const communityVisibility = or(
    eq(exchangeSparksTable.author_user_id, userId),
    viewer?.community_id == null
      ? isNull(exchangeSparksTable.community_id)
      : eq(exchangeSparksTable.community_id, viewer.community_id),
  );
  const legacyCommunityVisibility = or(
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
  const cursor = cursorValue == null ? null : decodeSparkCursor(cursorValue);
  if (cursorValue != null && !cursor) return res.status(400).json({ error: "Invalid Spark cursor" });

  let locationCondition: ReturnType<typeof and> | ReturnType<typeof sql> | undefined;
  if (nearby) {
    const viewerLocation = await getExchangeMatchingLocation(userId);
    if (viewerLocation?.lat != null && viewerLocation.lng != null
      && Number.isFinite(viewerLocation.lat) && Number.isFinite(viewerLocation.lng)) {
      const radius = req.query.radius_miles === undefined ? 15 : parseRadius(req.query.radius_miles)!;
      locationCondition = exchangeNearbyCondition(
        { lat: viewerLocation.lat, lng: viewerLocation.lng },
        radius,
        await exchangeSpatialIndexReady(),
      );
    } else {
      // Missing viewer coordinates must not widen a nearby request to all Sparks.
      locationCondition = sql`FALSE`;
    }
  }

  const durableRows = await db.select({
    spark_id: exchangeSparksTable.id,
    created_at: exchangeSparksTable.created_at,
    listing_id: exchangeListingsTable.id,
    author_user_id: exchangeSparksTable.author_user_id,
    author_name: usersTable.name,
    author_avatar_url: usersTable.avatar_url,
    caption: exchangeSparksTable.caption,
    neighborhood: exchangeListingsTable.neighborhood,
    media_asset_id: mediaAssetsTable.id,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
  }).from(exchangeSparksTable)
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangeSparksTable.listing_id))
    .innerJoin(usersTable, eq(usersTable.id, exchangeSparksTable.author_user_id))
    .innerJoin(mediaAssetsTable, and(
      eq(mediaAssetsTable.context_kind, "exchange_spark"),
      eq(mediaAssetsTable.context_id, exchangeSparksTable.id),
    ))
    .where(and(
      eq(exchangeSparksTable.status, "published"),
      communityVisibility,
      eq(mediaAssetsTable.status, "ready"),
      sql`${mediaAssetsTable.variant_key} IS NOT NULL`,
      eq(mediaAssetsTable.media_type, "video"),
      sql`${mediaAssetsTable.mime_type} LIKE 'video/%'`,
      eq(exchangeListingsTable.status, "active"),
      eq(exchangeListingsTable.moderation_status, "approved"),
      eq(exchangeListingsTable.seller_id, exchangeSparksTable.author_user_id),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      locationCondition,
      sql`NOT EXISTS (
        SELECT 1 FROM direct_message_blocks spark_block
        WHERE (spark_block.blocker_id = ${userId} AND spark_block.blocked_id = ${exchangeSparksTable.author_user_id})
           OR (spark_block.blocker_id = ${exchangeSparksTable.author_user_id} AND spark_block.blocked_id = ${userId})
      )`,
      cursor
        ? or(
          lt(exchangeSparksTable.created_at, new Date(cursor.created_at)),
          and(
            eq(exchangeSparksTable.created_at, new Date(cursor.created_at)),
            cursor.source === "durable" ? lt(exchangeSparksTable.id, cursor.id) : sql`FALSE`,
          ),
        )
        : undefined,
    ))
    .orderBy(desc(exchangeSparksTable.created_at), desc(exchangeSparksTable.id))
    .limit(pageSize + 1);

  // Old listing-linked Stories are still 24-hour Moments. Keep them visible
  // until their original expiry, without silently turning them into durable
  // listing media or changing legacy Story interaction permissions.
  const legacyRows = await db.select({
    story_id: communityStoriesTable.id,
    created_at: communityStoriesTable.created_at,
    expires_at: communityStoriesTable.expires_at,
    listing_id: exchangeListingsTable.id,
    caption: communityStoriesTable.caption,
    author_name: usersTable.name,
    author_avatar_url: usersTable.avatar_url,
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
      legacyCommunityVisibility,
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
            cursor.source === "legacy" ? lt(communityStoriesTable.id, cursor.id) : sql`TRUE`,
          ),
        )
        : undefined,
    ))
    .orderBy(desc(communityStoriesTable.created_at), desc(communityStoriesTable.id))
    .limit(pageSize + 1);

  const items = [
    ...durableRows.map((row) => ({
      id: row.spark_id, source: "durable" as const, created_at: row.created_at,
      listing_id: row.listing_id, caption: row.caption,
      author_name: row.author_name, author_avatar_url: row.author_avatar_url,
      neighborhood: row.neighborhood, expires_at: null as string | null,
      media_asset_id: row.media_asset_id,
      media_url: `/api/media-assets/${row.media_asset_id}`,
      thumbnail_url: row.thumbnail_key ? `/api/media-assets/${row.media_asset_id}/thumbnail` : null,
    })),
    ...legacyRows.map((row) => ({
      id: row.story_id, source: "legacy" as const, created_at: row.created_at,
      listing_id: row.listing_id, caption: row.caption,
      author_name: row.author_name, author_avatar_url: row.author_avatar_url,
      neighborhood: row.neighborhood, expires_at: row.expires_at.toISOString(),
      media_asset_id: null,
      media_url: `/api/community/stories/media/${row.media_id}`,
      thumbnail_url: row.thumbnail_storage_key || row.thumbnail_key
        ? `/api/community/stories/media/${row.media_id}?thumbnail=true`
        : null,
    })),
  ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()
    || (a.source === b.source ? 0 : a.source === "durable" ? -1 : 1)
    || b.id - a.id);
  const hasMore = items.length > pageSize;
  const pageRows = items.slice(0, pageSize);
  return res.json({
    sparks: pageRows.map((row) => ({
      listingId: row.listing_id,
      sparkId: row.source === "durable" ? row.id : null,
      storyId: row.source === "legacy" ? row.id : null,
      id: row.id,
      listing_id: row.listing_id,
      spark_id: row.source === "durable" ? row.id : null,
      caption: row.caption,
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at,
      durable: row.source === "durable",
      neighborhood: row.neighborhood,
      author_name: row.author_name,
      author_avatar_url: row.author_avatar_url,
      media_asset_id: row.media_asset_id,
      media_url: row.media_url,
      thumbnail_url: row.thumbnail_url,
    })),
    next_cursor: hasMore ? encodeSparkCursor({
      created_at: pageRows[pageRows.length - 1].created_at,
      id: pageRows[pageRows.length - 1].id,
      source: pageRows[pageRows.length - 1].source,
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
    locationCondition = exchangeNearbyCondition(
      { lat: viewerLocation.lat, lng: viewerLocation.lng },
      radius,
      await exchangeSpatialIndexReady(),
    );
  } else if (neighborhood) {
    locationCondition = eq(exchangeListingsTable.neighborhood, neighborhood);
  } else if (nearby) {
    // A nearby request without coordinates must not silently become a
    // community-wide feed.
    locationCondition = sql`FALSE`;
  }

  const conditions = mine
    ? and(eq(exchangeListingsTable.seller_id, userId), or(
      isNull(exchangeListingsTable.owner_history_removed_at),
      inArray(exchangeListingsTable.status, ["active", "reserved", "held"]),
    ))
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
  const mediaByListingId = await getListingMedia(pageRows, userId);
  return res.json({
    listings: pageRows.map((row) => serializeListing({
      ...row,
      media: mediaByListingId.get(row.id) ?? [],
    } as unknown as Record<string, unknown>)),
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
  return res.json({ listing: await serializeListingWithMedia(listing, req.authenticatedUserId!) });
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
  if (data.media_asset_ids.length > 0 && !isMediaPlatformV21Enabled()) {
    return res.status(503).json({ error: "Photo and video uploads are not available in this environment.", error_code: "MEDIA_PLATFORM_DISABLED" });
  }
  const moderation = moderatePostText(`${data.title}\n${data.description}\n${data.pickup_notes}`);
  const sellerLocation = await getExchangeMatchingLocation(req.authenticatedUserId!);
  const result = await db.transaction(async (tx) => {
    await lockExchangeAccounts(tx, [req.authenticatedUserId!]);
    if (!await exchangeAccountsAreActive(tx, [req.authenticatedUserId!])) return { kind: "account-unavailable" as const };

    let stagedAssets: ExchangeListingMediaAssetForBinding[] = [];
    if (data.media_asset_ids.length > 0) {
      const selectedAssets = await tx.select({
        id: mediaAssetsTable.id,
        owner_user_id: mediaAssetsTable.owner_user_id,
        context_kind: mediaAssetsTable.context_kind,
        context_id: mediaAssetsTable.context_id,
        media_type: mediaAssetsTable.media_type,
        mime_type: mediaAssetsTable.mime_type,
        byte_size: mediaAssetsTable.byte_size,
        duration_ms: mediaAssetsTable.duration_ms,
        status: mediaAssetsTable.status,
        metadata: mediaAssetsTable.metadata,
      }).from(mediaAssetsTable)
        .where(inArray(mediaAssetsTable.id, data.media_asset_ids))
        .for("update");
      const assetsById = new Map(selectedAssets.map((asset) => [asset.id, asset]));
      stagedAssets = data.media_asset_ids.flatMap((assetId) => {
        const asset = assetsById.get(assetId);
        return asset ? [asset] : [];
      });
      const mediaError = validateListingMediaSet(stagedAssets, data.media_asset_ids, req.authenticatedUserId!);
      if (mediaError) return { kind: "invalid-media" as const, error: mediaError };
    }

    const [created] = await tx.insert(exchangeListingsTable).values({
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
    if (!created) return { kind: "account-unavailable" as const };
    if (data.media_asset_ids.length > 0) {
      await tx.insert(exchangeListingMediaTable).values(data.media_asset_ids.map((assetId, position) => ({
        listing_id: created.id,
        media_asset_id: assetId,
        position,
      })));
      await tx.update(mediaAssetsTable).set({
        context_kind: "exchange_listing",
        context_id: created.id,
        updated_at: new Date(),
      }).where(inArray(mediaAssetsTable.id, data.media_asset_ids));
    }
    return { kind: "created" as const, listing: created };
  });
  if (result.kind === "account-unavailable") {
    return res.status(403).json({ error: "This account is no longer available for Exchange." });
  }
  if (result.kind === "invalid-media") return res.status(400).json({ error: result.error });
  const listing = result.listing;
  return res.status(201).json({
    listing: await serializeListingWithMedia(listing, req.authenticatedUserId!),
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
  const result = await db.transaction(async (tx) => {
    await lockExchangeAccounts(tx, [req.authenticatedUserId!]);
    if (!await exchangeAccountsAreActive(tx, [req.authenticatedUserId!])) {
      return { kind: "account-unavailable" as const };
    }
    const [current] = await tx.select().from(exchangeListingsTable).where(and(
      eq(exchangeListingsTable.id, id),
      eq(exchangeListingsTable.seller_id, req.authenticatedUserId!),
    )).limit(1).for("update");
    if (!current) return { kind: "not-found" as const };
    if (current.status !== "active" || current.moderation_status === "held") {
      return { kind: "conflict" as const };
    }

    const currentLinks = await tx.select({
      media_asset_id: exchangeListingMediaTable.media_asset_id,
    }).from(exchangeListingMediaTable)
      .where(eq(exchangeListingMediaTable.listing_id, id))
      .orderBy(asc(exchangeListingMediaTable.position))
      .for("update");
    const currentAssetIds = currentLinks.map((link) => link.media_asset_id);
    const currentAssetIdSet = new Set(currentAssetIds);
    const desiredAssetIds = data.media_asset_ids ?? currentAssetIds;
    if (!isMediaPlatformV21Enabled()
      && desiredAssetIds.some((assetId) => !currentAssetIdSet.has(assetId))) {
      return { kind: "media-disabled" as const };
    }
    let desiredAssets: ExchangeListingMediaAssetForBinding[] = [];
    if (data.media_asset_ids !== undefined && desiredAssetIds.length > 0) {
      const selectedAssets = await tx.select({
        id: mediaAssetsTable.id,
        owner_user_id: mediaAssetsTable.owner_user_id,
        context_kind: mediaAssetsTable.context_kind,
        context_id: mediaAssetsTable.context_id,
        media_type: mediaAssetsTable.media_type,
        mime_type: mediaAssetsTable.mime_type,
        byte_size: mediaAssetsTable.byte_size,
        duration_ms: mediaAssetsTable.duration_ms,
        status: mediaAssetsTable.status,
        metadata: mediaAssetsTable.metadata,
      }).from(mediaAssetsTable)
        .where(inArray(mediaAssetsTable.id, desiredAssetIds))
        .for("update");
      const assetsById = new Map(selectedAssets.map((asset) => [asset.id, asset]));
      desiredAssets = desiredAssetIds.flatMap((assetId) => {
        const asset = assetsById.get(assetId);
        return asset ? [asset] : [];
      });
      const mediaError = validateListingMediaSet(
        desiredAssets,
        desiredAssetIds,
        req.authenticatedUserId!,
        currentAssetIdSet,
        id,
      );
      if (mediaError) return { kind: "invalid-media" as const, error: mediaError };
    }

    const nextTitle = data.title ?? current.title;
    const nextDescription = data.description ?? current.description;
    const nextPickupNotes = data.pickup_notes ?? current.pickup_notes ?? "";
    const moderation = moderatePostText(`${nextTitle}\n${nextDescription}\n${nextPickupNotes}`);
    const updates = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => key !== "media_asset_ids" && value !== undefined),
    ) as Partial<typeof exchangeListingsTable.$inferInsert>;
    const now = new Date();
    const [updated] = await tx.update(exchangeListingsTable)
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
        eq(exchangeListingsTable.moderation_status, current.moderation_status),
      ))
      .returning();
    if (!updated) return { kind: "conflict" as const };

    const removedAssetIds = data.media_asset_ids === undefined
      ? []
      : currentAssetIds.filter((assetId) => !desiredAssetIds.includes(assetId));
    if (data.media_asset_ids !== undefined) {
      await tx.delete(exchangeListingMediaTable).where(eq(exchangeListingMediaTable.listing_id, id));
      if (desiredAssetIds.length > 0) {
        await tx.insert(exchangeListingMediaTable).values(desiredAssetIds.map((assetId, position) => ({
          listing_id: id,
          media_asset_id: assetId,
          position,
        })));
      }
      const addedAssetIds = desiredAssetIds.filter((assetId) => !currentAssetIdSet.has(assetId));
      if (addedAssetIds.length > 0) {
        await tx.update(mediaAssetsTable).set({
          context_kind: "exchange_listing",
          context_id: id,
          updated_at: now,
        }).where(inArray(mediaAssetsTable.id, addedAssetIds));
      }
      if (removedAssetIds.length > 0) {
        await tx.update(mediaAssetsTable).set({
          status: "deleted",
          metadata: sql`jsonb_set(${mediaAssetsTable.metadata}, '{storage_cleanup_pending}', 'true'::jsonb, true)`,
          updated_at: now,
        }).where(and(
          inArray(mediaAssetsTable.id, removedAssetIds),
          eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
          eq(mediaAssetsTable.context_kind, "exchange_listing"),
          eq(mediaAssetsTable.context_id, id),
        ));
        await tx.update(mediaProcessingJobsTable).set({
          status: "cancelled",
          updated_at: now,
        }).where(and(
          inArray(mediaProcessingJobsTable.media_asset_id, removedAssetIds),
          inArray(mediaProcessingJobsTable.status, ["queued", "failed"]),
        ));
      }
    }
    return { kind: "updated" as const, listing: updated, moderation, removedAssetIds };
  });

  if (result.kind === "account-unavailable") {
    return res.status(403).json({ error: "This account is no longer available for Exchange." });
  }
  if (result.kind === "not-found") return res.status(404).json({ error: "Listing not found" });
  if (result.kind === "conflict") {
    return res.status(409).json({ error: "This listing changed or is no longer available for editing." });
  }
  if (result.kind === "media-disabled") {
    return res.status(503).json({ error: "Photo and video uploads are not available in this environment.", error_code: "MEDIA_PLATFORM_DISABLED" });
  }
  if (result.kind === "invalid-media") return res.status(400).json({ error: result.error });
  const updated = result.listing;
  const moderation = result.moderation;
  await cleanupDeletedListingMedia(result.removedAssetIds);

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
    listing: await serializeListingWithMedia(updated, req.authenticatedUserId!),
    message: moderation.status === "approved"
      ? "Listing updated."
      : "Listing updated and held for safety review.",
  });
});

// Private history removal never deletes shared pickup, dispute or media rows.
// Lock the listing first, as request creation does, to serialize new pickups.
router.post("/community/exchange/listings/:id/remove-history", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid listing id" });
  const result = await db.transaction(async (tx) => {
    const [listing] = await tx.select().from(exchangeListingsTable).where(and(
      eq(exchangeListingsTable.id, id),
      eq(exchangeListingsTable.seller_id, req.authenticatedUserId!),
    )).for("update").limit(1);
    if (!listing) return { status: 404, error: "Listing not found" };
    if (!["withdrawn", "completed", "archived"].includes(listing.status)) {
      return { status: 409, error: "Withdraw or finish this listing before removing it from your history." };
    }
    const [active] = await tx.select({ id: exchangePickupRequestsTable.id }).from(exchangePickupRequestsTable)
      .where(and(eq(exchangePickupRequestsTable.listing_id, id),
        inArray(exchangePickupRequestsTable.status, ["requested", "accepted", "disputed"]))).limit(1);
    if (active) return { status: 409, error: "Resolve active pickup requests before removing this listing from your history." };
    await tx.update(exchangeListingsTable).set({ owner_history_removed_at: new Date() })
      .where(eq(exchangeListingsTable.id, id));
    return { status: 200 };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json({ removed_from_history: true, retained_for_safety: true });
});

router.post("/community/exchange/pickup-requests/:id/remove-history", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid pickup request id" });
  const userId = req.authenticatedUserId!;
  const result = await db.transaction(async (tx) => {
    const [pickup] = await tx.select().from(exchangePickupRequestsTable)
      .where(eq(exchangePickupRequestsTable.id, id)).for("update").limit(1);
    if (!pickup) return { status: 404, error: "Pickup request not found" };
    const [listing] = await tx.select({ seller_id: exchangeListingsTable.seller_id }).from(exchangeListingsTable)
      .where(eq(exchangeListingsTable.id, pickup.listing_id)).limit(1);
    if (!listing || (pickup.buyer_id !== userId && listing.seller_id !== userId)) {
      return { status: 404, error: "Pickup request not found" };
    }
    if (!["completed", "cancelled", "declined", "expired"].includes(pickup.status)) {
      return { status: 409, error: "Finish or cancel this pickup before removing it from your history." };
    }
    const [dispute] = await tx.select({ id: exchangePickupDisputesTable.id }).from(exchangePickupDisputesTable)
      .where(and(eq(exchangePickupDisputesTable.pickup_request_id, id), eq(exchangePickupDisputesTable.status, "open"))).limit(1);
    if (dispute) return { status: 409, error: "Resolve the open dispute before removing this pickup from your history." };
    await tx.update(exchangePickupRequestsTable).set(pickup.buyer_id === userId
      ? { buyer_history_removed_at: new Date() }
      : { seller_history_removed_at: new Date() }).where(eq(exchangePickupRequestsTable.id, id));
    return { status: 200 };
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.json({ removed_from_history: true, retained_for_safety: true });
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
  if (!updated) return res.status(409).json({ error: "This listing changed while you were withdrawing it. Refresh and try again." });
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
      owner_history_removed_at: null,
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
    actionUrl: "/community?tab=exchange&mine=true",
    metadata: { exchange_listing_id: updated.id, action: "renewed" },
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: renewal notification failed");
  });
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
    .where(and(
      or(eq(exchangePickupRequestsTable.buyer_id, userId), eq(exchangeListingsTable.seller_id, userId)),
      or(
        inArray(exchangePickupRequestsTable.status, ["requested", "accepted", "disputed"]),
        and(eq(exchangePickupRequestsTable.buyer_id, userId), isNull(exchangePickupRequestsTable.buyer_history_removed_at)),
        and(eq(exchangeListingsTable.seller_id, userId), isNull(exchangePickupRequestsTable.seller_history_removed_at)),
        sql`EXISTS (SELECT 1 FROM exchange_pickup_disputes d WHERE d.pickup_request_id = ${exchangePickupRequestsTable.id} AND d.status = 'open')`,
      ),
    ))
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
      await lockExchangeAccounts(tx, [userId, listing.seller_id]);
      if (!await exchangeAccountsAreActive(tx, [userId, listing.seller_id])) return null;
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
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: pickup request notification failed");
  });
  void sendPushToUser(listing.seller_id, {
    title: "A neighbor wants to coordinate",
    body: `Someone responded to “${safeListingLabel(listing.title)}”. Open Exchange to review the request.`,
    notifType: "task_accepted",
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: pickup request push failed");
  });
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
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: acceptance notification failed");
  });
  void sendPushToUser(result.pickup_request.buyer_id, {
    title: "Your Exchange request was accepted",
    body: "Your neighbor accepted the coordination request. Open Exchange to confirm the handoff details.",
    notifType: "task_accepted",
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: acceptance push failed");
  });
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
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: decline notification failed");
  });
  void sendPushToUser(updated.buyer_id, {
    title: "Your Exchange request was declined",
    body: "This coordination request was declined. You can browse Exchange for other ways to connect with a neighbor.",
    notifType: "task_accepted",
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: decline push failed");
  });
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
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: cancellation notification failed");
  });
  void sendPushToUser(otherParticipantId, {
    title: "Exchange coordination was cancelled",
    body: result.listingAvailableAgain
      ? "The other participant cancelled this pickup coordination. The approved listing is available again."
      : "The other participant cancelled this pickup coordination. Listing visibility remains subject to safety review; if archived, its owner can renew it after approval.",
    notifType: "task_accepted",
  }).catch((error) => {
    logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: cancellation push failed");
  });
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
      }).catch((error) => {
        logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: handoff notification failed");
      });
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
        actionUrl: "/community?tab=exchange&mine=true",
        metadata: { exchange_listing_id: listingId, action: "temporary_hold" },
      }).catch((error) => {
        logger.warn({ errorName: error instanceof Error ? error.name : typeof error }, "community exchange: temporary hold notification failed");
      });
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