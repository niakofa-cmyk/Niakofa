import { Router } from "express";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryElementsTable,
  communityStoryMediaTable,
  directMessageBlocksTable,
  db,
  diasporaHubsTable,
  exchangeListingsTable,
  hubMembershipsTable,
  mediaAssetsTable,
  mediaProcessingJobsTable,
  usersTable,
  type StoryCompositionManifest,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { communityPostLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { deleteAsset, deleteAssetStrict, putAsset, streamAssetRange, streamAssetSameOrigin } from "../lib/storage";
import { hasExpectedSignature, inspectMedia } from "../lib/media-validation";
import { broadcast } from "../lib/ws-hub";
import { createMessageNotification } from "../lib/message-notifications";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { enqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue";
import { mediaProcessingQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import {
  canReadCommunityStoryAudience,
  canReadExchangeLinkedStory,
  isLinkedStoryVideoAssetReady,
  storyVideoStreamContentType,
} from "../lib/community-story-policy";
import {
  buildStoryPlaybackSetCookie,
  issueStoryPlaybackGrant,
  readStoryPlaybackCookie,
  verifyStoryPlaybackGrant,
} from "../lib/community-story-playback";

const router = Router();
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 6;
const MAX_MEDIA_DIMENSION = 10_000;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const STORY_AUDIENCES = ["community", "hub"] as const;

const storyElementSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  type: z.string().trim().min(1).max(40),
  payload: z.record(z.string(), z.unknown()).default({}),
  position_x: z.number().min(0).max(100).default(50),
  position_y: z.number().min(0).max(100).default(50),
  scale: z.number().min(0.5).max(3).default(1),
  rotation: z.number().min(-180).max(180).default(0),
  z_index: z.number().int().min(0).max(100).default(0),
});

const createStorySchema = z.object({
  client_publish_id: z.string().uuid().optional(),
  caption: z.string().trim().max(1000).optional().default(""),
  hub_id: z.number().int().positive().nullable().optional(),
  exchange_listing_id: z.number().int().positive().optional(),
  audience: z.enum(STORY_AUDIENCES).default("community"),
  reply_enabled: z.boolean().default(true),
  media: z.array(z.object({
    data_url: z.string().min(1).max(18_000_000),
    media_type: z.enum(["photo", "video"]),
    mime_type: z.string().max(100),
    duration_ms: z.number().int().positive().max(60_000).nullable().optional(),
    width: z.number().int().positive().max(10_000).nullable().optional(),
    height: z.number().int().positive().max(10_000).nullable().optional(),
  })).min(0).max(MAX_MEDIA_ITEMS).default([]),
  media_asset_ids: z.array(z.number().int().positive()).max(MAX_MEDIA_ITEMS).optional(),
  elements: z.array(storyElementSchema).max(30).default([]),
  composition_manifest: z.object({
    version: z.literal(1),
    canvas: z.object({
      width: z.number().positive().max(10_000),
      height: z.number().positive().max(10_000),
      aspect: z.enum(["9:16", "1:1", "16:9"]),
    }),
    elements: z.array(storyElementSchema).max(30),
    music: z.object({
      track_id: z.string().trim().min(1).max(200).optional(),
      track_key: z.string().trim().min(1).max(500).optional(),
      title: z.string().trim().max(200).optional(),
      start_ms: z.number().int().min(0).optional(),
      end_ms: z.number().int().positive().optional(),
      volume: z.number().min(0).max(2).optional(),
      licensed: z.boolean().optional(),
    }).nullable().optional(),
    effects: z.array(z.enum(["grayscale", "sepia", "blur"])).max(6).optional(),
  }).optional(),
});

export function communityStoryPublishPayloadHash(payload: {
  caption: string | null;
  audience: string;
  hubId: number | null;
  exchangeListingId: number | null;
  communityId: number | null;
  replyEnabled: boolean;
  elements: z.infer<typeof storyElementSchema>[];
  compositionManifest: StoryCompositionManifest;
  mediaAssetIds: number[];
}): string {
  const canonicalPayload = JSON.stringify({
    caption: payload.caption,
    audience: payload.audience,
    hub_id: payload.hubId,
    exchange_listing_id: payload.exchangeListingId,
    community_id: payload.communityId,
    reply_enabled: payload.replyEnabled,
    elements: payload.elements,
    composition_manifest: payload.compositionManifest,
    media_asset_ids: payload.mediaAssetIds,
  }, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
    : value);
  return createHash("sha256").update(canonicalPayload).digest("hex");
}

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function serializeDate(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function normalizeCompositionManifest(
  input: z.infer<typeof createStorySchema>["composition_manifest"],
  fallbackElements: z.infer<typeof storyElementSchema>[],
): StoryCompositionManifest {
  const source = input?.elements ?? fallbackElements;
  return {
    version: 1,
    canvas: input?.canvas ?? { width: 1080, height: 1920, aspect: "9:16" },
    elements: source.map((element, index) => ({
      id: element.id ?? `element-${index + 1}`,
      type: element.type,
      payload: element.payload,
      position_x: element.position_x,
      position_y: element.position_y,
      scale: element.scale,
      rotation: element.rotation,
      z_index: element.z_index,
    })),
    music: input?.music ?? null,
    effects: input?.effects ?? [],
  };
}

function decodeMediaDataUrl(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !ALLOWED_MEDIA.has(match[1])) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES || !hasExpectedSignature(buffer, match[1])) return null;
  return { buffer, mimeType: match[1] };
}

async function approvedHubMember(userId: number, hubId: number): Promise<boolean> {
  const [membership] = await db
    .select({ id: hubMembershipsTable.id })
    .from(hubMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
    .where(and(
      eq(hubMembershipsTable.user_id, userId),
      eq(hubMembershipsTable.hub_id, hubId),
      eq(hubMembershipsTable.status, "approved"),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
    ))
    .limit(1);
  return Boolean(membership);
}

async function approvedCanonicalHub(hubId: number): Promise<boolean> {
  const [hub] = await db
    .select({ id: diasporaHubsTable.id })
    .from(diasporaHubsTable)
    .where(and(
      eq(diasporaHubsTable.id, hubId),
      eq(diasporaHubsTable.status, "approved"),
      isNull(diasporaHubsTable.primary_hub_id),
    ))
    .limit(1);
  return Boolean(hub);
}

export async function viewerCanReadStory(userId: number, story: {
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  audience: string;
  exchange_listing_id?: number | null;
}): Promise<boolean> {
  const [viewer] = await db.select({
    community_id: usersTable.community_id,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
    trust_score: usersTable.trust_score,
  })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [author] = await db.select({
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
  }).from(usersTable).where(eq(usersTable.id, story.author_user_id)).limit(1);
  if (!viewer || viewer.approval_status !== "approved" || viewer.is_suspended
    || viewer.trust_score !== null && viewer.trust_score <= -1
    || !author || author.approval_status !== "approved" || author.is_suspended) {
    return false;
  }
  if (story.exchange_listing_id != null) {
    const [listing] = await db.select({
      seller_id: exchangeListingsTable.seller_id,
      status: exchangeListingsTable.status,
      moderation_status: exchangeListingsTable.moderation_status,
      seller_approval_status: usersTable.approval_status,
      seller_is_suspended: usersTable.is_suspended,
    }).from(exchangeListingsTable)
      .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
      .where(eq(exchangeListingsTable.id, story.exchange_listing_id))
      .limit(1);
    const blocks = await db.select({
      blocker_id: directMessageBlocksTable.blocker_id,
      blocked_id: directMessageBlocksTable.blocked_id,
    })
      .from(directMessageBlocksTable)
      .where(or(
        and(eq(directMessageBlocksTable.blocker_id, userId), eq(directMessageBlocksTable.blocked_id, story.author_user_id)),
        and(eq(directMessageBlocksTable.blocker_id, story.author_user_id), eq(directMessageBlocksTable.blocked_id, userId)),
      )).limit(1);
    if (!listing || !canReadExchangeLinkedStory({
      viewerUserId: userId,
      viewerCommunityId: viewer?.community_id ?? null,
      authorUserId: story.author_user_id,
      authorCommunityId: story.community_id,
      listingSellerId: listing.seller_id,
      listingStatus: listing.status,
      listingModerationStatus: listing.moderation_status,
      sellerApprovalStatus: listing.seller_approval_status,
      sellerIsSuspended: listing.seller_is_suspended,
      audience: story.audience,
      blocks,
    })) return false;
    return true;
  }
  if (story.author_user_id === userId) return true;
  if (story.audience === "hub") return story.hub_id !== null && await approvedHubMember(userId, story.hub_id);
  return canReadCommunityStoryAudience(story.audience, viewer?.community_id ?? null, story.community_id);
}

function publicStory(row: {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  caption: string | null;
  audience: string;
  reply_enabled: boolean;
  created_at: Date;
  expires_at: Date;
  author_name: string;
  avatar_url: string | null;
  composition_manifest: typeof communityStoriesTable.$inferSelect["composition_manifest"];
  exchange_listing_id: number | null;
}, media: Array<typeof communityStoryMediaTable.$inferSelect>, elements: Array<typeof communityStoryElementsTable.$inferSelect>) {
  return {
    id: row.id,
    author_user_id: row.author_user_id,
    hub_id: row.hub_id,
    exchange_listing_id: row.exchange_listing_id,
    community_id: row.community_id,
    caption: row.caption,
    audience: row.audience,
    reply_enabled: row.reply_enabled,
    created_at: serializeDate(row.created_at),
    expires_at: serializeDate(row.expires_at),
    composition_manifest: row.composition_manifest,
    author: { id: row.author_user_id, name: row.author_name, avatar_url: row.avatar_url },
    media: media.map((item) => ({
      id: item.id,
      media_type: item.media_type,
      mime_type: item.mime_type,
      duration_ms: item.duration_ms,
      width: item.width,
      height: item.height,
      media_url: `/api/community/stories/media/${item.id}`,
    })),
    elements: elements.map((item) => ({
      id: item.id,
      type: item.type,
      payload: item.payload,
      position_x: item.position_x,
      position_y: item.position_y,
      scale: item.scale,
      rotation: item.rotation,
      z_index: item.z_index,
    })),
  };
}

async function readableStoryVideoMedia(mediaId: number, userId: number) {
  const [row] = await db.select({
    storage_key: communityStoryMediaTable.storage_key,
    media_type: communityStoryMediaTable.media_type,
    mime_type: communityStoryMediaTable.mime_type,
    variant_key: mediaAssetsTable.variant_key,
    media_asset_id: communityStoryMediaTable.media_asset_id,
    asset_status: mediaAssetsTable.status,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    audience: communityStoriesTable.audience,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
  }).from(communityStoryMediaTable)
    .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(eq(communityStoryMediaTable.id, mediaId))
    .limit(1);
  if (!row || row.media_type !== "video" || !row.mime_type.startsWith("video/")
    || row.status !== "published"
    || row.expires_at <= new Date() || !(await viewerCanReadStory(userId, row))) return null;
  if (!isLinkedStoryVideoAssetReady({
    linked: row.exchange_listing_id !== null,
    mediaType: row.media_type,
    mediaAssetId: row.media_asset_id,
    assetStatus: row.asset_status,
    variantKey: row.variant_key,
  })) return null;
  return row;
}

router.get("/community/stories", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const requestedHubId = req.query.hubId ? positiveId(req.query.hubId) : null;
  if (req.query.hubId && !requestedHubId) return res.status(400).json({ error: "hubId must be a positive integer." });
  if (requestedHubId && !(await approvedCanonicalHub(requestedHubId))) return res.status(404).json({ error: "Canonical Hub not found." });
  if (requestedHubId && !(await approvedHubMember(userId, requestedHubId))) return res.status(403).json({ error: "Approved Hub membership is required to view this Hub's Stories." });
  const requestedLimit = req.query.limit === undefined ? 100 : Number(req.query.limit);
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
    return res.status(400).json({ error: "limit must be an integer between 1 and 100." });
  }
  let cursor: { createdAt: Date; id: number } | null = null;
  if (req.query.cursor !== undefined) {
    try {
      const value = String(req.query.cursor);
      if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) throw new Error("invalid cursor");
      const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { created_at?: unknown; id?: unknown };
      const createdAt = typeof parsed.created_at === "string" ? new Date(parsed.created_at) : new Date(NaN);
      if (!Number.isFinite(createdAt.getTime()) || !Number.isSafeInteger(parsed.id) || Number(parsed.id) < 1) {
        throw new Error("invalid cursor");
      }
      cursor = { createdAt, id: Number(parsed.id) };
    } catch {
      return res.status(400).json({ error: "cursor is invalid." });
    }
  }

  const [viewer] = await db.select({ community_id: usersTable.community_id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const approvedHubIds = (await db.select({ hub_id: hubMembershipsTable.hub_id })
    .from(hubMembershipsTable)
    .where(and(
      eq(hubMembershipsTable.user_id, userId),
      eq(hubMembershipsTable.status, "approved"),
    ))).map((membership) => membership.hub_id);
  const now = new Date();
  const visibility = requestedHubId
    ? and(eq(communityStoriesTable.hub_id, requestedHubId), eq(communityStoriesTable.audience, "hub"))
    : or(
      and(
        eq(communityStoriesTable.audience, "community"),
        or(
          eq(communityStoriesTable.author_user_id, userId),
          viewer?.community_id == null
            ? isNull(communityStoriesTable.community_id)
            : eq(communityStoriesTable.community_id, viewer.community_id),
        ),
      ),
      approvedHubIds.length
        ? and(eq(communityStoriesTable.audience, "hub"), inArray(communityStoriesTable.hub_id, approvedHubIds))
        : sql`false`,
      eq(communityStoriesTable.author_user_id, userId),
    );
  const queriedRows = await db.select({
    id: communityStoriesTable.id,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    community_id: communityStoriesTable.community_id,
    caption: communityStoriesTable.caption,
    audience: communityStoriesTable.audience,
    reply_enabled: communityStoriesTable.reply_enabled,
    created_at: communityStoriesTable.created_at,
    expires_at: communityStoriesTable.expires_at,
    composition_manifest: communityStoriesTable.composition_manifest,
    author_name: usersTable.name,
    avatar_url: usersTable.avatar_url,
  }).from(communityStoriesTable)
    .innerJoin(usersTable, eq(usersTable.id, communityStoriesTable.author_user_id))
    .where(and(
      eq(communityStoriesTable.status, "published"),
      sql`${communityStoriesTable.expires_at} > ${now}`,
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      visibility,
      or(
        isNull(communityStoriesTable.exchange_listing_id),
        sql`EXISTS (
          SELECT 1
          FROM exchange_listings linked_listing
          WHERE linked_listing.id = ${communityStoriesTable.exchange_listing_id}
            AND linked_listing.seller_id = ${communityStoriesTable.author_user_id}
            AND linked_listing.status = 'active'
            AND linked_listing.moderation_status = 'approved'
            AND (
              ${communityStoriesTable.author_user_id} = ${userId}
              OR ${communityStoriesTable.community_id} IS NOT DISTINCT FROM ${viewer?.community_id ?? null}
            )
            AND NOT EXISTS (
              SELECT 1 FROM direct_message_blocks listing_block
              WHERE (listing_block.blocker_id = ${userId} AND listing_block.blocked_id = linked_listing.seller_id)
                 OR (listing_block.blocker_id = linked_listing.seller_id AND listing_block.blocked_id = ${userId})
            )
        )`,
      ),
      or(
        isNull(communityStoriesTable.exchange_listing_id),
        sql`EXISTS (
          SELECT 1
          FROM community_story_media linked_media
          LEFT JOIN media_assets linked_asset ON linked_asset.id = linked_media.media_asset_id
          WHERE linked_media.story_id = ${communityStoriesTable.id}
            AND linked_media.media_type = 'video'
            AND (
              linked_media.media_asset_id IS NULL
              OR (linked_asset.status = 'ready' AND linked_asset.variant_key IS NOT NULL)
            )
        )`,
      ),
      cursor
        ? or(
          lt(communityStoriesTable.created_at, cursor.createdAt),
          and(
            eq(communityStoriesTable.created_at, cursor.createdAt),
            lt(communityStoriesTable.id, cursor.id),
          ),
        )
        : undefined,
    ))
    .orderBy(desc(communityStoriesTable.created_at), desc(communityStoriesTable.id))
    .limit(requestedLimit + 1);
  const hasMore = queriedRows.length > requestedLimit;
  const rows = queriedRows.slice(0, requestedLimit);

  const ids = rows.map((row) => row.id);
  const [mediaRows, elements] = ids.length ? await Promise.all([
    db.select({
      media: communityStoryMediaTable,
      linked_listing_id: communityStoriesTable.exchange_listing_id,
      asset_status: mediaAssetsTable.status,
      asset_variant_key: mediaAssetsTable.variant_key,
    }).from(communityStoryMediaTable)
      .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
      .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
      .where(inArray(communityStoryMediaTable.story_id, ids))
      .orderBy(asc(communityStoryMediaTable.id)),
    db.select().from(communityStoryElementsTable).where(inArray(communityStoryElementsTable.story_id, ids)).orderBy(communityStoryElementsTable.z_index),
  ]) : [[], []];
  const media = mediaRows.filter((item) => (item.media.media_asset_id === null || item.asset_status === "ready")
    && isLinkedStoryVideoAssetReady({
    linked: item.linked_listing_id !== null,
    mediaType: item.media.media_type,
    mediaAssetId: item.media.media_asset_id,
    assetStatus: item.asset_status,
    variantKey: item.asset_variant_key,
  })).map((item) => item.media);
  const mediaByStory = new Map<number, Array<typeof communityStoryMediaTable.$inferSelect>>();
  media.forEach((item) => mediaByStory.set(item.story_id, [...(mediaByStory.get(item.story_id) ?? []), item]));
  const elementsByStory = new Map<number, Array<typeof communityStoryElementsTable.$inferSelect>>();
  elements.forEach((item) => elementsByStory.set(item.story_id, [...(elementsByStory.get(item.story_id) ?? []), item]));
  return res.json({
    stories: rows.map((row) => publicStory(row, mediaByStory.get(row.id) ?? [], elementsByStory.get(row.id) ?? [])),
    viewer_user_id: userId,
    expires_after_hours: 24,
    next_cursor: hasMore && rows.length
      ? Buffer.from(JSON.stringify({
        created_at: rows[rows.length - 1].created_at?.toISOString(),
        id: rows[rows.length - 1].id,
      })).toString("base64url")
      : null,
  });
});

router.get("/community/stories/moment-media-status", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const contextKind = String(req.query.contextKind ?? "");
  const contextId = positiveId(req.query.contextId);
  const rawIds = String(req.query.ids ?? "");
  const ids = rawIds ? rawIds.split(",").map(Number) : [];
  if (!["community_moment", "hub_moment"].includes(contextKind)
    || !contextId || !ids.length || ids.length > MAX_MEDIA_ITEMS
    || ids.some((id) => !Number.isSafeInteger(id) || id < 1)
    || new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: "Moment media context and up to six unique asset ids are required." });
  }
  if (contextKind === "community_moment" && contextId !== userId) {
    return res.status(404).json({ error: "Moment upload context not found." });
  }
  if (contextKind === "hub_moment"
    && (!(await approvedCanonicalHub(contextId)) || !(await approvedHubMember(userId, contextId)))) {
    return res.status(404).json({ error: "Moment upload context not found." });
  }
  const assets = await db.select({
    id: mediaAssetsTable.id,
    status: mediaAssetsTable.status,
    media_type: mediaAssetsTable.media_type,
    variant_key: mediaAssetsTable.variant_key,
    failure_reason: mediaAssetsTable.failure_reason,
  }).from(mediaAssetsTable)
    .where(and(
      inArray(mediaAssetsTable.id, ids),
      eq(mediaAssetsTable.owner_user_id, userId),
      eq(mediaAssetsTable.context_kind, contextKind),
      eq(mediaAssetsTable.context_id, contextId),
    ));
  if (assets.length !== ids.length) return res.status(404).json({ error: "One or more Moment uploads are unavailable." });
  return res.json({
    assets: assets.map((asset) => ({
      id: asset.id,
      status: asset.status,
      media_type: asset.media_type,
      variant_ready: Boolean(asset.variant_key),
      failure_code: asset.status === "failed"
        ? asset.failure_reason?.match(/^MEDIA_[A-Z_]+/)?.[0] ?? "MEDIA_PROCESSING_FAILED"
        : null,
    })),
  });
});

router.post("/community/stories", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const parsed = createStorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Story data is invalid. Add a photo, video, or caption and try again." });
  const userId = req.authenticatedUserId!;
  const hubId = parsed.data.hub_id ?? null;
  const exchangeListingId = parsed.data.exchange_listing_id ?? null;
  const mediaAssetIds = parsed.data.media_asset_ids ?? [];
  const [viewer] = await db.select({ community_id: usersTable.community_id })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const caption = cleanText(parsed.data.caption, 1000) || null;
  const compositionManifest = normalizeCompositionManifest(parsed.data.composition_manifest, parsed.data.elements);
  const publishPayloadHash = parsed.data.client_publish_id
    ? communityStoryPublishPayloadHash({
      caption,
      audience: parsed.data.audience,
      hubId,
      exchangeListingId,
      communityId: viewer?.community_id ?? null,
      replyEnabled: parsed.data.reply_enabled,
      elements: parsed.data.elements,
      compositionManifest,
      mediaAssetIds,
    })
    : null;
  if (parsed.data.client_publish_id) {
    const [existing] = await db.select({
      id: communityStoriesTable.id,
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
      publish_payload_hash: communityStoriesTable.publish_payload_hash,
    }).from(communityStoriesTable).where(and(
      eq(communityStoriesTable.author_user_id, userId),
      eq(communityStoriesTable.client_publish_id, parsed.data.client_publish_id),
    )).limit(1);
    if (existing) {
      if (parsed.data.media.length || existing.publish_payload_hash !== publishPayloadHash) {
        return res.status(409).json({ error: "client_publish_id was already used with different Story content or context." });
      }
      return res.status(200).json({
        story: { id: existing.id, status: existing.status, expires_at: existing.expires_at.toISOString() },
      });
    }
  }
  if (mediaAssetIds.length && parsed.data.media.length) {
    return res.status(400).json({ error: "Use either uploaded media assets or inline Story media, not both." });
  }
  if (parsed.data.client_publish_id && parsed.data.media.length) {
    return res.status(400).json({ error: "client_publish_id is not supported with inline Base64 Story media." });
  }
  if (new Set(mediaAssetIds).size !== mediaAssetIds.length) {
    return res.status(400).json({ error: "Moment media asset ids must be unique." });
  }
  if (mediaAssetIds.length && exchangeListingId !== null) {
    return res.status(400).json({ error: "Exchange-linked Sparks must use their dedicated media upload flow." });
  }
  if (mediaAssetIds.length) {
    const attachedAssets = await db.select({
      story_id: communityStoryMediaTable.story_id,
      media_asset_id: communityStoryMediaTable.media_asset_id,
      author_user_id: communityStoriesTable.author_user_id,
      caption: communityStoriesTable.caption,
      audience: communityStoriesTable.audience,
      hub_id: communityStoriesTable.hub_id,
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
    }).from(communityStoryMediaTable)
      .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
      .where(inArray(communityStoryMediaTable.media_asset_id, mediaAssetIds));
    if (attachedAssets.length) {
      if (parsed.data.client_publish_id) {
        return res.status(409).json({ error: "One or more uploaded assets have already been attached to a Moment." });
      }
      const first = attachedAssets[0];
      const isSameCompletedCreate = attachedAssets.length === mediaAssetIds.length
        && attachedAssets.every((asset) => asset.story_id === first?.story_id
          && asset.author_user_id === userId
          && asset.caption === (cleanText(parsed.data.caption, 1000) || null)
          && asset.audience === parsed.data.audience
          && asset.hub_id === hubId
          && (asset.status === "published" || asset.status === "pending")
          && asset.expires_at > new Date())
        && new Set(attachedAssets.map((asset) => asset.media_asset_id)).size === mediaAssetIds.length;
      if (!isSameCompletedCreate || !first) {
        return res.status(409).json({ error: "One or more uploaded assets have already been attached to a Moment." });
      }
      return res.status(200).json({
        story: {
          id: first.story_id,
          status: first.status,
          expires_at: first.expires_at.toISOString(),
        },
      });
    }
  }
  if (hubId && (!(await approvedCanonicalHub(hubId)) || !(await approvedHubMember(userId, hubId)))) {
    return res.status(403).json({ error: "Approved Hub membership is required to publish a Hub Story." });
  }
  if (parsed.data.audience === "hub" && !hubId) return res.status(400).json({ error: "Choose a Hub before sharing with a Hub audience." });
  if (exchangeListingId !== null) {
    if (parsed.data.audience !== "community") {
      return res.status(400).json({ error: "An Exchange Spark must use the community audience." });
    }
    if (parsed.data.media.length !== 1 || parsed.data.media[0]?.media_type !== "video") {
      return res.status(400).json({ error: "An Exchange Spark must contain one video." });
    }
    const [listing] = await db.select({
      id: exchangeListingsTable.id,
      seller_id: exchangeListingsTable.seller_id,
    }).from(exchangeListingsTable)
      .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
      .where(and(
        eq(exchangeListingsTable.id, exchangeListingId),
        eq(exchangeListingsTable.seller_id, userId),
        eq(exchangeListingsTable.status, "active"),
        eq(exchangeListingsTable.moderation_status, "approved"),
        eq(usersTable.approval_status, "approved"),
        eq(usersTable.is_suspended, false),
      ))
      .limit(1);
    if (!listing) return res.status(404).json({ error: "An active, approved Exchange listing you own is required." });
  }
  if (!parsed.data.caption && parsed.data.media.length === 0 && mediaAssetIds.length === 0 && parsed.data.elements.length === 0) {
    return res.status(400).json({ error: "A Story needs media, text, or a creative element." });
  }
  const stagedContextKind = parsed.data.audience === "hub" ? "hub_moment" : "community_moment";
  const stagedContextId = parsed.data.audience === "hub" ? hubId : userId;
  if (mediaAssetIds.length) {
    const stagedAssets = await db.select({
      id: mediaAssetsTable.id,
      status: mediaAssetsTable.status,
      media_type: mediaAssetsTable.media_type,
      mime_type: mediaAssetsTable.mime_type,
      variant_key: mediaAssetsTable.variant_key,
      duration_ms: mediaAssetsTable.duration_ms,
    }).from(mediaAssetsTable)
      .where(and(
        inArray(mediaAssetsTable.id, mediaAssetIds),
        eq(mediaAssetsTable.owner_user_id, userId),
        eq(mediaAssetsTable.context_kind, stagedContextKind),
        eq(mediaAssetsTable.context_id, stagedContextId!),
      ));
    if (stagedAssets.length !== mediaAssetIds.length) {
      return res.status(404).json({ error: "One or more uploaded assets do not belong to this Moment context." });
    }
    if (stagedAssets.some((asset) => asset.status === "failed")) {
      return res.status(409).json({ error: "One or more uploaded assets failed processing. Retry processing or choose another file.", error_code: "MOMENT_MEDIA_FAILED" });
    }
    if (stagedAssets.some((asset) => asset.media_type === "video" && (asset.duration_ms ?? 0) > 60_000)) {
      return res.status(400).json({ error: "Story videos must be 60 seconds or shorter." });
    }
    if (stagedAssets.some((asset) => asset.status !== "ready"
      || asset.media_type === "video" && (!asset.variant_key || !asset.duration_ms)
      || !["photo", "video", "audio"].includes(asset.media_type))) {
      return res.status(409).json({ error: "Moment media is still processing. Wait until every file is ready, then retry.", error_code: "MOMENT_MEDIA_NOT_READY" });
    }
    if (stagedAssets.some((asset) => asset.media_type === "photo" && !asset.mime_type.startsWith("image/")
      || asset.media_type === "video" && !asset.mime_type.startsWith("video/")
      || asset.media_type === "audio" && !asset.mime_type.startsWith("audio/"))) {
      return res.status(400).json({ error: "Uploaded media type does not match its file format." });
    }
  }
  const moderation = moderatePostText(caption ?? "");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const storedKeys: string[] = [];
  if (isMediaPlatformV21Enabled() && !mediaProcessingQueue) {
    return res.status(503).json({
      error: "Media processing is not available. Please try again shortly.",
      error_code: "MEDIA_PROCESSING_UNAVAILABLE",
    });
  }
  try {
    const decodedMedia = await Promise.all(parsed.data.media.map(async (item) => {
      const decoded = decodeMediaDataUrl(item.data_url);
      if (!decoded || decoded.mimeType !== item.mime_type || (item.media_type === "photo" && !decoded.mimeType.startsWith("image/")) || (item.media_type === "video" && !decoded.mimeType.startsWith("video/"))) {
        return { ...item, decoded: null, metadata: null };
      }
      return { ...item, decoded, metadata: await inspectMedia(decoded.buffer, decoded.mimeType) };
    }));
    if (decodedMedia.some((item) => !item.decoded || item.decoded.mimeType !== item.mime_type)) {
      return res.status(400).json({ error: "Unsupported media type or a file is larger than 12 MB." });
    }
    if (decodedMedia.some((item) => item.media_type === "photo" && !item.metadata)) {
      return res.status(400).json({ error: "The image could not be inspected. Please choose another image." });
    }
    if (decodedMedia.some((item) => (
      !item.metadata ||
      !item.metadata.width ||
      !item.metadata.height ||
      item.metadata.width > MAX_MEDIA_DIMENSION ||
      item.metadata.height > MAX_MEDIA_DIMENSION
    ))) {
      return res.status(400).json({ error: "Story media dimensions must be 10,000 pixels or smaller." });
    }
    if (decodedMedia.some((item) => item.media_type === "video" && (!item.metadata || !item.metadata.duration_ms))) {
      return res.status(503).json({ error: "Video processing is temporarily unavailable. Please try again shortly." });
    }
    if (decodedMedia.some((item) => (item.metadata?.duration_ms ?? 0) > 60_000)) {
      return res.status(400).json({ error: "Story videos must be 60 seconds or shorter." });
    }
    const mentionIds = parsed.data.elements
      .filter((element) => element.type === "mention")
      .map((element) => Number(element.payload.mention_user_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (parsed.data.elements.some((element) => element.type === "mention" && !Number.isSafeInteger(Number(element.payload.mention_user_id)))) {
      return res.status(400).json({ error: "Choose a community member from the mention suggestions." });
    }
    const mentionUsers = mentionIds.length ? await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(inArray(usersTable.id, mentionIds), eq(usersTable.approval_status, "approved"), eq(usersTable.is_suspended, false))) : [];
    if (mentionUsers.length !== mentionIds.length) return res.status(400).json({ error: "One or more Story mentions are no longer available." });
    const result = await db.transaction(async (tx) => {
      const stagedAssets = mediaAssetIds.length
        ? await tx.select().from(mediaAssetsTable)
          .where(and(
            inArray(mediaAssetsTable.id, mediaAssetIds),
            eq(mediaAssetsTable.owner_user_id, userId),
            eq(mediaAssetsTable.context_kind, stagedContextKind),
            eq(mediaAssetsTable.context_id, stagedContextId!),
          ))
          .for("update")
        : [];
      if (stagedAssets.length !== mediaAssetIds.length) return { kind: "media_not_found" as const };
      if (stagedAssets.some((asset) => asset.status === "failed")) return { kind: "media_failed" as const };
      if (stagedAssets.some((asset) => asset.media_type === "video" && (asset.duration_ms ?? 0) > 60_000)) {
        return { kind: "media_too_long" as const };
      }
      if (stagedAssets.some((asset) => asset.status !== "ready"
        || asset.media_type === "video" && (!asset.variant_key || !asset.duration_ms)
        || !["photo", "video", "audio"].includes(asset.media_type))) {
        return { kind: "media_not_ready" as const };
      }
      const [story] = await tx.insert(communityStoriesTable).values({
        author_user_id: userId,
        hub_id: hubId,
        community_id: viewer?.community_id ?? null,
        exchange_listing_id: exchangeListingId,
        client_publish_id: parsed.data.client_publish_id ?? null,
        publish_payload_hash: publishPayloadHash,
        caption,
        audience: parsed.data.audience,
        status: moderation.status === "approved" ? "published" : "pending",
        reply_enabled: parsed.data.reply_enabled,
        composition_manifest: compositionManifest,
        expires_at: expiresAt,
      }).returning();
      if (!story) throw new Error("Story could not be saved.");
      const mediaAssetJobs: Array<{ id: number; mediaType: string; manifest: typeof compositionManifest }> = [];
      for (const item of decodedMedia) {
        const decoded = item.decoded!;
        const extension = decoded.mimeType.split("/")[1].replace("jpeg", "jpg");
        const storageKey = `community-stories/${story.id}/${randomUUID()}.${extension}`;
        await putAsset(storageKey, decoded.buffer, decoded.mimeType);
        storedKeys.push(storageKey);
        let mediaAssetId: number | null = null;
        if (isMediaPlatformV21Enabled()) {
          const [asset] = await tx.insert(mediaAssetsTable).values({
            owner_user_id: userId,
            context_kind: "story",
            context_id: story.id,
            media_type: item.media_type,
            mime_type: decoded.mimeType,
            original_key: storageKey,
            byte_size: decoded.buffer.length,
            width: item.metadata?.width ?? null,
            height: item.metadata?.height ?? null,
            duration_ms: item.metadata?.duration_ms ?? null,
            composition_manifest: compositionManifest,
          }).returning({ id: mediaAssetsTable.id });
          mediaAssetId = asset?.id ?? null;
          if (!mediaAssetId) throw new Error("Media asset could not be created.");
          mediaAssetJobs.push({ id: mediaAssetId, mediaType: item.media_type, manifest: compositionManifest });
        }
        await tx.insert(communityStoryMediaTable).values({
          story_id: story.id,
          media_asset_id: mediaAssetId,
          storage_key: storageKey,
          media_type: item.media_type,
          mime_type: decoded.mimeType,
          byte_size: decoded.buffer.length,
          duration_ms: item.metadata?.duration_ms ?? null,
          width: item.metadata?.width ?? null,
          height: item.metadata?.height ?? null,
        });
      }
      if (stagedAssets.length) {
        await tx.insert(communityStoryMediaTable).values(stagedAssets.map((asset) => ({
          story_id: story.id,
          media_asset_id: asset.id,
          storage_key: asset.original_key,
          media_type: asset.media_type,
          mime_type: asset.mime_type,
          byte_size: asset.byte_size,
          duration_ms: asset.duration_ms,
          width: asset.width,
          height: asset.height,
        })));
        await tx.update(mediaAssetsTable)
          .set({
            context_kind: "story",
            context_id: story.id,
            updated_at: new Date(),
          })
          .where(and(
            inArray(mediaAssetsTable.id, mediaAssetIds),
            eq(mediaAssetsTable.owner_user_id, userId),
            eq(mediaAssetsTable.context_kind, stagedContextKind),
            eq(mediaAssetsTable.context_id, stagedContextId!),
          ));
      }
      if (parsed.data.elements.length) {
        await tx.insert(communityStoryElementsTable).values(parsed.data.elements.map((element) => ({
          story_id: story.id,
          type: element.type,
          payload: element.payload,
          position_x: element.position_x,
          position_y: element.position_y,
          scale: element.scale,
          rotation: element.rotation,
          z_index: element.z_index,
        })));
      }
      return { kind: "created" as const, story, mediaAssetJobs };
    });
    if (result.kind === "media_not_found") {
      if (parsed.data.client_publish_id) {
        const [existing] = await db.select({
          id: communityStoriesTable.id,
          status: communityStoriesTable.status,
          expires_at: communityStoriesTable.expires_at,
          publish_payload_hash: communityStoriesTable.publish_payload_hash,
        }).from(communityStoriesTable).where(and(
          eq(communityStoriesTable.author_user_id, userId),
          eq(communityStoriesTable.client_publish_id, parsed.data.client_publish_id),
        )).limit(1);
        if (existing) {
          if (existing.publish_payload_hash !== publishPayloadHash) {
            return res.status(409).json({ error: "client_publish_id was already used with different Story content or context." });
          }
          return res.status(200).json({
            story: { id: existing.id, status: existing.status, expires_at: existing.expires_at.toISOString() },
          });
        }
      }
      return res.status(404).json({ error: "One or more uploaded assets do not belong to this Moment context." });
    }
    if (result.kind === "media_failed") return res.status(409).json({ error: "One or more uploaded assets failed processing.", error_code: "MOMENT_MEDIA_FAILED" });
    if (result.kind === "media_too_long") return res.status(400).json({ error: "Story videos must be 60 seconds or shorter." });
    if (result.kind === "media_not_ready") return res.status(409).json({ error: "Moment media is still processing. Retry after every file is ready.", error_code: "MOMENT_MEDIA_NOT_READY" });
    if (result.mediaAssetJobs.length) {
      try {
        await Promise.all(result.mediaAssetJobs.map((job) => enqueueMediaAssetProcessing(job.id, job.mediaType, job.manifest)));
      } catch (error) {
        // Keep the original object and durable pending rows. A retry/reconciler
        // can republish deterministic BullMQ job ids without losing the upload.
        logger.error({ err: error, storyId: result.story.id }, "media-processing: Story jobs could not be published");
        return res.status(503).json({
          error: "Story saved, but media processing is temporarily unavailable. Please refresh shortly.",
          error_code: "MEDIA_PROCESSING_UNAVAILABLE",
        });
      }
    }
    if (result.story.status === "published") {
      broadcast({ type: "community_story_created", payload: { story_id: result.story.id, author_user_id: userId, audience: result.story.audience, hub_id: result.story.hub_id } });
      const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      await Promise.all(mentionUsers.filter((user) => user.id !== userId).map((user) => createMessageNotification({
        userId: user.id,
        actorUserId: userId,
        type: "story_mention",
        title: "You were mentioned in a Story",
        body: `${author?.name ?? "A neighbor"} mentioned you in a Community Story.`,
         actionUrl: `/community?storyId=${result.story.id}`,
         metadata: { story_id: result.story.id, mention_user_id: user.id },
      })));
    }
    return res.status(201).json({ story: { id: result.story.id, status: result.story.status, expires_at: result.story.expires_at.toISOString() } });
  } catch (error) {
    await Promise.all(storedKeys.map((key) => deleteAsset(key)));
    const databaseError = error as { code?: unknown };
    if (parsed.data.client_publish_id && databaseError.code === "23505") {
      const [existing] = await db.select({
        id: communityStoriesTable.id,
        status: communityStoriesTable.status,
        expires_at: communityStoriesTable.expires_at,
        publish_payload_hash: communityStoriesTable.publish_payload_hash,
      }).from(communityStoriesTable).where(and(
        eq(communityStoriesTable.author_user_id, userId),
        eq(communityStoriesTable.client_publish_id, parsed.data.client_publish_id),
      )).limit(1);
      if (existing) {
        if (existing.publish_payload_hash !== publishPayloadHash) {
          return res.status(409).json({ error: "client_publish_id was already used with different Story content or context." });
        }
        return res.status(200).json({
          story: { id: existing.id, status: existing.status, expires_at: existing.expires_at.toISOString() },
        });
      }
    }
    throw error;
  }
});

router.get("/community/stories/media/:id", requireAuth, requireApproved, async (req, res) => {
  const mediaId = positiveId(req.params.id);
  if (!mediaId) return res.status(400).json({ error: "Invalid Story media id." });
  const [row] = await db.select({
    storage_key: communityStoryMediaTable.storage_key,
    thumbnail_storage_key: communityStoryMediaTable.thumbnail_storage_key,
    media_type: communityStoryMediaTable.media_type,
    mime_type: communityStoryMediaTable.mime_type,
    media_asset_id: communityStoryMediaTable.media_asset_id,
    variant_key: mediaAssetsTable.variant_key,
    asset_status: mediaAssetsTable.status,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    audience: communityStoriesTable.audience,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
  }).from(communityStoryMediaTable)
    .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(eq(communityStoryMediaTable.id, mediaId))
    .limit(1);
  if (!row || row.status !== "published" || row.expires_at <= new Date()
      || row.media_asset_id !== null && row.asset_status !== "ready"
      || !(await viewerCanReadStory(req.authenticatedUserId!, row))) {
    return res.status(404).json({ error: "Story media not found." });
  }
  if (!isLinkedStoryVideoAssetReady({
    linked: row.exchange_listing_id !== null,
    mediaType: row.media_type,
    mediaAssetId: row.media_asset_id,
    assetStatus: row.asset_status,
    variantKey: row.variant_key,
  })) return res.status(404).json({ error: "Story media not found." });
  const thumbnail = req.query.thumbnail === "true";
  if (thumbnail) {
    if (row.thumbnail_storage_key || row.thumbnail_key) {
      return streamAssetSameOrigin(row.thumbnail_storage_key ?? row.thumbnail_key!, res);
    }
    return res.status(404).json({ error: "Story thumbnail not found." });
  }
  if (row.media_type === "video") {
    const claims = verifyStoryPlaybackGrant(
      readStoryPlaybackCookie(req.headers.cookie),
      mediaId,
      process.env["SESSION_SECRET"],
    );
    const [viewer] = await db.select({
      token_version: usersTable.token_version,
      trust_score: usersTable.trust_score,
    }).from(usersTable).where(eq(usersTable.id, req.authenticatedUserId!)).limit(1);
    if (!claims || claims.userId !== req.authenticatedUserId
      || !viewer || claims.tokenVersion !== viewer.token_version
      || viewer.trust_score !== null && viewer.trust_score <= -1) {
      return res.status(404).json({ error: "Story video not found." });
    }
    return streamAssetRange(
      row.variant_key ?? row.storage_key,
      req,
      res,
      storyVideoStreamContentType(row.variant_key, row.mime_type),
    );
  }
  return streamAssetSameOrigin(row.variant_key ?? row.storage_key, res);
});

router.post("/community/stories/media/:id/playback-grant", requireAuth, requireApproved, async (req, res) => {
  const mediaId = positiveId(req.params.id);
  if (!mediaId) return res.status(404).json({ error: "Story video not found." });
  const userId = req.authenticatedUserId!;
  const media = await readableStoryVideoMedia(mediaId, userId);
  if (!media) return res.status(404).json({ error: "Story video not found." });

  const [viewer] = await db.select({
    token_version: usersTable.token_version,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
    trust_score: usersTable.trust_score,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const secret = process.env["SESSION_SECRET"];
  if (!viewer || viewer.approval_status !== "approved" || viewer.is_suspended
    || viewer.trust_score !== null && viewer.trust_score <= -1) {
    return res.status(404).json({ error: "Story video not found." });
  }
  if (req.authenticatedTokenVersion !== viewer.token_version) {
    return res.status(401).json({ error: "Session expired — please log in again", error_code: "TOKEN_REVOKED" });
  }
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: "Secure Story playback is temporarily unavailable." });
  }

  const grant = issueStoryPlaybackGrant({ mediaId, userId, tokenVersion: viewer.token_version }, secret);
  const cookiePath = `/api/community/stories/media/${mediaId}/play`;
  res.setHeader("Set-Cookie", buildStoryPlaybackSetCookie(grant.value, mediaId, req.secure || req.protocol === "https"));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  return res.json({
    playback_url: cookiePath,
    expires_at: new Date(grant.claims.expiresAt).toISOString(),
  });
});

router.get("/community/stories/media/:id/play", async (req, res) => {
  const mediaId = positiveId(req.params.id);
  const cookieValue = readStoryPlaybackCookie(req.headers.cookie);
  const secret = process.env["SESSION_SECRET"];
  const claims = mediaId && secret
    ? verifyStoryPlaybackGrant(cookieValue, mediaId, secret)
    : null;
  if (!mediaId || !claims) return res.status(404).json({ error: "Story video not found." });

  const [viewer] = await db.select({
    id: usersTable.id,
    token_version: usersTable.token_version,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
    trust_score: usersTable.trust_score,
  }).from(usersTable).where(eq(usersTable.id, claims.userId)).limit(1);
  if (!viewer || viewer.token_version !== claims.tokenVersion
    || viewer.approval_status !== "approved" || viewer.is_suspended
    || viewer.trust_score !== null && viewer.trust_score <= -1) {
    return res.status(404).json({ error: "Story video not found." });
  }
  const media = await readableStoryVideoMedia(mediaId, claims.userId);
  if (!media) return res.status(404).json({ error: "Story video not found." });
  return streamAssetRange(
    media.variant_key ?? media.storage_key,
    req,
    res,
    storyVideoStreamContentType(media.variant_key, media.mime_type),
  );
});

router.delete("/community/stories/:id", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  const [ownedStory] = await db.update(communityStoriesTable).set({ status: "deletion_pending" }).where(and(
    eq(communityStoriesTable.id, storyId),
    eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
  )).returning({ id: communityStoriesTable.id });
  if (!ownedStory) return res.json({ deleted: false });
  const universalAssets = await db.select({
    id: mediaAssetsTable.id,
    original_key: mediaAssetsTable.original_key,
    variant_key: mediaAssetsTable.variant_key,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
  }).from(mediaAssetsTable).where(and(
    eq(mediaAssetsTable.context_kind, "story"),
    eq(mediaAssetsTable.context_id, storyId),
  ));
  const assetIds = universalAssets.map((asset) => asset.id);
  if (assetIds.length) {
    await db.update(mediaProcessingJobsTable).set({
      status: "cancelled",
      updated_at: new Date(),
    }).where(and(
      inArray(mediaProcessingJobsTable.media_asset_id, assetIds),
      inArray(mediaProcessingJobsTable.status, ["queued", "failed"]),
    ));
    const [processingJob] = await db.select({ id: mediaProcessingJobsTable.id })
      .from(mediaProcessingJobsTable)
      .where(and(
        inArray(mediaProcessingJobsTable.media_asset_id, assetIds),
        eq(mediaProcessingJobsTable.status, "processing"),
      ))
      .limit(1);
    if (processingJob) {
      return res.status(409).json({
        deleted: false,
        status: "deletion_pending",
        error: "Story media processing must finish before cleanup can complete. Retry shortly.",
        error_code: "STORY_MEDIA_PROCESSING",
      });
    }
    await db.update(mediaAssetsTable).set({
      status: "deletion_pending",
      updated_at: new Date(),
    }).where(inArray(mediaAssetsTable.id, assetIds));
  }
  const media = await db.select({
    storage_key: communityStoryMediaTable.storage_key,
    thumbnail_storage_key: communityStoryMediaTable.thumbnail_storage_key,
    original_key: mediaAssetsTable.original_key,
    variant_key: mediaAssetsTable.variant_key,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
  }).from(communityStoryMediaTable)
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(eq(communityStoryMediaTable.story_id, storyId));
  const storageKeys = [...new Set([
    ...media.flatMap((item) => [
      item.storage_key,
      item.thumbnail_storage_key,
      item.original_key,
      item.variant_key,
      item.thumbnail_key,
    ]),
    ...universalAssets.flatMap((asset) => [
      asset.original_key,
      asset.variant_key,
      asset.thumbnail_key,
    ]),
  ].filter((key): key is string => Boolean(key)))];
  const cleanup = await Promise.allSettled(storageKeys.map((key) => deleteAssetStrict(key)));
  const cleanupFailure = cleanup.find((result) => result.status === "rejected");
  if (cleanupFailure?.status === "rejected") {
    logger.error({ err: cleanupFailure.reason, storyId }, "community-story: storage cleanup failed; Story kept for retry");
    return res.status(503).json({
      deleted: false,
      error: "Story media could not be fully removed. The Story was kept so cleanup can be retried.",
      error_code: "STORY_MEDIA_CLEANUP_FAILED",
    });
  }
  try {
    // Keep universal asset rows as short-lived tombstones after the Story row
    // is removed. The expiry scheduler repeats key deletion before purging
    // these rows, catching binary uploads that were already in flight.
    const deleted = await db.delete(communityStoriesTable).where(and(
      eq(communityStoriesTable.id, storyId),
      eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
    )).returning({ id: communityStoriesTable.id });
    return res.json({ deleted: deleted.length > 0 });
  } catch (error) {
    logger.error({ err: error, storyId }, "community-story: row cleanup failed; Story kept for retry");
    return res.status(503).json({
      deleted: false,
      error: "Story cleanup could not be completed. The Story was kept so cleanup can be retried.",
      error_code: "STORY_MEDIA_CLEANUP_FAILED",
    });
  }
});

export default router;