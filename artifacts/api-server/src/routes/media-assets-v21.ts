import { Router, type Request, type Response } from "express";
import { and, desc, eq, ne, or } from "drizzle-orm";
import {
  communityStoriesTable,
  db,
  directConversationMembersTable,
  directMessageBlocksTable,
  directConversationsTable,
  diasporaHubsTable,
  exchangeListingsTable,
  exchangeSparksTable,
  hubMembershipsTable,
  mediaAssetsTable,
  requestsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { deleteAssetStrict, getAssetBuffer, getAssetInfo, putAsset, streamAssetRange } from "../lib/storage";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { enqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue";
import { mediaProcessingQueue } from "../lib/queue";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isAllowedMediaSize, MAX_MEDIA_BYTES, validateMediaBuffer } from "../lib/media-validation";
import { logger } from "../lib/logger";
import { issueExchangeSparkPlaybackGrant, verifyExchangeSparkPlaybackGrant } from "../lib/exchange-spark-playback";
import {
  canReadCommunityStoryAudience,
  canReadExchangeLinkedStory,
  canWriteStoryMediaContext,
  isDuplicateExchangeStoryVideoSession,
} from "../lib/community-story-policy";

const router = Router();
const CONTEXT_KINDS = new Set(["story", "exchange_spark", "direct", "request", "hub"]);

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function isApprovedUser(userId: number): Promise<boolean> {
  const [user] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, userId),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
    ))
    .limit(1);
  return Boolean(user);
}

async function canReadContext(userId: number, contextKind: string, contextId: number): Promise<boolean> {
  if (!(await isApprovedUser(userId))) return false;

  // Staging assets are intentionally not shared with a Community or Hub.
  // They become readable only after the Story create transaction rebinds them
  // to a persisted Story context.
  if (contextKind === "community_moment" || contextKind === "hub_moment") return false;

  if (contextKind === "direct") {
    const [member] = await db.select({ user_id: directConversationMembersTable.user_id })
      .from(directConversationMembersTable)
      .innerJoin(directConversationsTable, eq(directConversationsTable.id, directConversationMembersTable.conversation_id))
      .where(and(
        eq(directConversationMembersTable.conversation_id, contextId),
        eq(directConversationMembersTable.user_id, userId),
        eq(directConversationsTable.status, "active"),
      ))
      .limit(1);
    return Boolean(member);
  }

  if (contextKind === "story") {
    const [story] = await db.select({
      author_user_id: communityStoriesTable.author_user_id,
      hub_id: communityStoriesTable.hub_id,
      community_id: communityStoriesTable.community_id,
      exchange_listing_id: communityStoriesTable.exchange_listing_id,
      audience: communityStoriesTable.audience,
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
    }).from(communityStoriesTable)
      .where(eq(communityStoriesTable.id, contextId))
      .limit(1);
    if (!story || story.status !== "published" || story.expires_at <= new Date()) return false;
    if (story.exchange_listing_id !== null) {
      const [viewer] = await db.select({ community_id: usersTable.community_id })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
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
      if (!listing) return false;
      const blocks = await db.select({
        blocker_id: directMessageBlocksTable.blocker_id,
        blocked_id: directMessageBlocksTable.blocked_id,
      }).from(directMessageBlocksTable)
        .where(or(
          and(eq(directMessageBlocksTable.blocker_id, userId), eq(directMessageBlocksTable.blocked_id, story.author_user_id)),
          and(eq(directMessageBlocksTable.blocker_id, story.author_user_id), eq(directMessageBlocksTable.blocked_id, userId)),
        ))
        .limit(1);
      return canReadExchangeLinkedStory({
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
      });
    }
    if (story.author_user_id === userId) return true;
    if (story.audience === "hub") {
      if (!story.hub_id) return false;
      const [membership] = await db.select({ id: hubMembershipsTable.id })
        .from(hubMembershipsTable)
        .innerJoin(diasporaHubsTable, eq(diasporaHubsTable.id, hubMembershipsTable.hub_id))
        .where(and(
          eq(hubMembershipsTable.user_id, userId),
          eq(hubMembershipsTable.hub_id, story.hub_id),
          eq(hubMembershipsTable.status, "approved"),
          eq(diasporaHubsTable.status, "approved"),
        ))
        .limit(1);
      return Boolean(membership);
    }
    const [viewer] = await db.select({ community_id: usersTable.community_id })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    return canReadCommunityStoryAudience(
      story.audience,
      viewer?.community_id ?? null,
      story.community_id,
    );
  }

  if (contextKind === "exchange_spark") {
    const [spark] = await db.select({
      author_user_id: exchangeSparksTable.author_user_id,
      community_id: exchangeSparksTable.community_id,
      status: exchangeSparksTable.status,
      listing_seller_id: exchangeListingsTable.seller_id,
      listing_status: exchangeListingsTable.status,
      listing_moderation_status: exchangeListingsTable.moderation_status,
      seller_approval_status: usersTable.approval_status,
      seller_is_suspended: usersTable.is_suspended,
    }).from(exchangeSparksTable)
      .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangeSparksTable.listing_id))
      .innerJoin(usersTable, eq(usersTable.id, exchangeSparksTable.author_user_id))
      .where(eq(exchangeSparksTable.id, contextId))
      .limit(1);
    if (!spark || spark.status !== "published"
      || spark.listing_status !== "active"
      || spark.listing_moderation_status !== "approved"
      || spark.listing_seller_id !== spark.author_user_id
      || spark.seller_approval_status !== "approved"
      || spark.seller_is_suspended) return false;
    if (spark.author_user_id === userId) return true;
    const [viewer] = await db.select({ community_id: usersTable.community_id })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (viewer?.community_id !== spark.community_id) return false;
    const blocks = await db.select({ blocker_id: directMessageBlocksTable.blocker_id })
      .from(directMessageBlocksTable)
      .where(or(
        and(eq(directMessageBlocksTable.blocker_id, userId), eq(directMessageBlocksTable.blocked_id, spark.author_user_id)),
        and(eq(directMessageBlocksTable.blocker_id, spark.author_user_id), eq(directMessageBlocksTable.blocked_id, userId)),
      ))
      .limit(1);
    return blocks.length === 0;
  }

  if (contextKind === "hub") {
    const [membership] = await db.select({ id: hubMembershipsTable.id })
      .from(hubMembershipsTable)
      .innerJoin(diasporaHubsTable, eq(diasporaHubsTable.id, hubMembershipsTable.hub_id))
      .where(and(
        eq(hubMembershipsTable.user_id, userId),
        eq(hubMembershipsTable.hub_id, contextId),
        eq(hubMembershipsTable.status, "approved"),
        eq(diasporaHubsTable.status, "approved"),
      ))
      .limit(1);
    return Boolean(membership);
  }

  if (contextKind === "request") {
    const [request] = await db.select({ id: requestsTable.id })
      .from(requestsTable)
      .where(and(
        eq(requestsTable.id, contextId),
        // A request asset is private to the requester and current helper.
        // Hub-wide sharing can be added later with an explicit policy.
        eq(requestsTable.requester_id, userId),
      ))
      .limit(1);
    if (request) return true;
    const [helperRequest] = await db.select({ id: requestsTable.id })
      .from(requestsTable)
      .where(and(eq(requestsTable.id, contextId), eq(requestsTable.helper_id, userId)))
      .limit(1);
    return Boolean(helperRequest);
  }

  return false;
}

async function canWriteContext(userId: number, contextKind: string, contextId: number): Promise<boolean> {
  if (contextKind === "community_moment") return contextId === userId && await isApprovedUser(userId);
  if (contextKind === "hub_moment") return canReadContext(userId, "hub", contextId);
  if (contextKind === "story") {
    const [story] = await db.select({
      author_user_id: communityStoriesTable.author_user_id,
      status: communityStoriesTable.status,
      expires_at: communityStoriesTable.expires_at,
      exchange_listing_id: communityStoriesTable.exchange_listing_id,
    })
      .from(communityStoriesTable)
      .where(eq(communityStoriesTable.id, contextId))
      .limit(1);
    if (!story) return false;
    const [listing] = story.exchange_listing_id === null
      ? [undefined]
      : await db.select({
        seller_id: exchangeListingsTable.seller_id,
        status: exchangeListingsTable.status,
        moderation_status: exchangeListingsTable.moderation_status,
        seller_approval_status: usersTable.approval_status,
        seller_is_suspended: usersTable.is_suspended,
      }).from(exchangeListingsTable)
        .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
        .where(eq(exchangeListingsTable.id, story.exchange_listing_id))
        .limit(1);
    return canWriteStoryMediaContext({
      userId,
      authorUserId: story.author_user_id,
      expiresAt: story.expires_at,
      now: new Date(),
      storyStatus: story.status,
      exchangeListingId: story.exchange_listing_id,
      listingSellerId: listing?.seller_id ?? null,
      listingStatus: listing?.status ?? null,
      listingModerationStatus: listing?.moderation_status ?? null,
      sellerApprovalStatus: listing?.seller_approval_status ?? null,
      sellerIsSuspended: listing?.seller_is_suspended ?? null,
    });
  }
  if (contextKind === "exchange_spark") {
    const [spark] = await db.select({
      author_user_id: exchangeSparksTable.author_user_id,
      status: exchangeSparksTable.status,
      draft_expires_at: exchangeSparksTable.draft_expires_at,
      listing_id: exchangeSparksTable.listing_id,
      listing_seller_id: exchangeListingsTable.seller_id,
      listing_status: exchangeListingsTable.status,
      listing_moderation_status: exchangeListingsTable.moderation_status,
      seller_approval_status: usersTable.approval_status,
      seller_is_suspended: usersTable.is_suspended,
    }).from(exchangeSparksTable)
      .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangeSparksTable.listing_id))
      .innerJoin(usersTable, eq(usersTable.id, exchangeSparksTable.author_user_id))
      .where(eq(exchangeSparksTable.id, contextId))
      .limit(1);
    return Boolean(spark
      && spark.author_user_id === userId
      && spark.status === "draft"
      && spark.draft_expires_at > new Date()
      && spark.listing_seller_id === userId
      && spark.listing_status === "active"
      && spark.listing_moderation_status === "approved"
      && spark.seller_approval_status === "approved"
      && !spark.seller_is_suspended);
  }
  return canReadContext(userId, contextKind, contextId);
}

function disabled(res: Response) {
  return res.status(404).json({
    error: "Universal media is not enabled in this environment.",
    error_code: "MEDIA_PLATFORM_DISABLED",
  });
}

const uploadRequestSchema = z.object({
  contextKind: z.enum(["story", "exchange_spark", "direct", "request", "hub", "community_moment", "hub_moment"]),
  contextId: z.number().int().positive(),
  mediaType: z.enum(["photo", "video", "audio", "document"]),
  mimeType: z.string().trim().min(3).max(120),
  originalName: z.string().trim().max(255).optional(),
  byteSize: z.number().int().refine(isAllowedMediaSize, `Must be between 1 and ${MAX_MEDIA_BYTES} bytes.`),
});

function extensionForMime(mimeType: string): string {
  const value = mimeType.split("/")[1]?.replace(/[^a-z0-9]+/gi, "").toLowerCase();
  return value === "jpeg" ? "jpg" : value || "bin";
}

router.post("/media-assets/uploads", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const parsed = uploadRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid media upload metadata." });
  const input = parsed.data;
  if (!(await canWriteContext(req.authenticatedUserId!, input.contextKind, input.contextId))) {
    return res.status(404).json({ error: "Media context not found." });
  }
  if (!mediaProcessingQueue) {
    return res.status(503).json({
      error: "Media processing is not available. Please try again shortly.",
      error_code: "MEDIA_PROCESSING_UNAVAILABLE",
    });
  }

  const key = `media-assets/incoming/${req.authenticatedUserId}/${randomUUID()}.${extensionForMime(input.mimeType)}`;
  const values = {
    owner_user_id: req.authenticatedUserId!,
    context_kind: input.contextKind,
    context_id: input.contextId,
    media_type: input.mediaType,
    mime_type: input.mimeType,
    original_name: input.originalName ?? null,
    original_key: key,
    byte_size: input.byteSize,
  };
  let asset: { id: number } | undefined;
  if (input.contextKind === "exchange_spark" && input.mediaType === "video") {
    const result = await db.transaction(async (tx) => {
      const [spark] = await tx.select({
        author_user_id: exchangeSparksTable.author_user_id,
        listing_id: exchangeSparksTable.listing_id,
        status: exchangeSparksTable.status,
        draft_expires_at: exchangeSparksTable.draft_expires_at,
      }).from(exchangeSparksTable)
        .where(eq(exchangeSparksTable.id, input.contextId))
        .limit(1)
        .for("update");
      if (!spark || spark.author_user_id !== req.authenticatedUserId || spark.status !== "draft"
        || spark.draft_expires_at <= new Date()) {
        return { kind: "not-found" as const };
      }
      const [listing] = await tx.select({
        seller_id: exchangeListingsTable.seller_id,
        status: exchangeListingsTable.status,
        moderation_status: exchangeListingsTable.moderation_status,
        seller_approval_status: usersTable.approval_status,
        seller_is_suspended: usersTable.is_suspended,
      }).from(exchangeListingsTable)
        .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
        .where(eq(exchangeListingsTable.id, spark.listing_id))
        .limit(1)
        .for("update");
      if (!listing || listing.seller_id !== req.authenticatedUserId
        || listing.status !== "active"
        || listing.moderation_status !== "approved"
        || listing.seller_approval_status !== "approved"
        || listing.seller_is_suspended) return { kind: "not-found" as const };

      const [existingVideo] = await tx.select({ id: mediaAssetsTable.id })
        .from(mediaAssetsTable)
        .where(and(
          eq(mediaAssetsTable.context_kind, "exchange_spark"),
          eq(mediaAssetsTable.context_id, input.contextId),
          eq(mediaAssetsTable.media_type, "video"),
          ne(mediaAssetsTable.status, "deleted"),
        ))
        .limit(1)
        .for("update");
      if (existingVideo) return { kind: "duplicate" as const };
      const [created] = await tx.insert(mediaAssetsTable).values(values)
        .returning({ id: mediaAssetsTable.id });
      return created ? { kind: "created" as const, asset: created } : { kind: "failed" as const };
    });
    if (result.kind === "not-found") return res.status(404).json({ error: "Media context not found." });
    if (result.kind === "duplicate") {
      return res.status(409).json({
        error: "This Exchange Spark draft already has a video upload session.",
        error_code: "SPARK_VIDEO_SESSION_EXISTS",
      });
    }
    if (result.kind === "failed") return res.status(500).json({ error: "Media upload could not be initialized." });
    asset = result.asset;
  } else if (input.contextKind === "story" && input.mediaType === "video") {
    const result = await db.transaction(async (tx) => {
      const [story] = await tx.select({
        author_user_id: communityStoriesTable.author_user_id,
        status: communityStoriesTable.status,
        expires_at: communityStoriesTable.expires_at,
        exchange_listing_id: communityStoriesTable.exchange_listing_id,
      }).from(communityStoriesTable)
        .where(eq(communityStoriesTable.id, input.contextId))
        .limit(1)
        .for("update");
      if (!story) return { kind: "not-found" as const };

      const [listing] = story.exchange_listing_id === null
        ? [undefined]
        : await tx.select({
          seller_id: exchangeListingsTable.seller_id,
          status: exchangeListingsTable.status,
          moderation_status: exchangeListingsTable.moderation_status,
          seller_approval_status: usersTable.approval_status,
          seller_is_suspended: usersTable.is_suspended,
        }).from(exchangeListingsTable)
          .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
          .where(eq(exchangeListingsTable.id, story.exchange_listing_id))
          .limit(1)
          .for("update");

      const canWrite = canWriteStoryMediaContext({
        userId: req.authenticatedUserId!,
        authorUserId: story.author_user_id,
        expiresAt: story.expires_at,
        now: new Date(),
        storyStatus: story.status,
        exchangeListingId: story.exchange_listing_id,
        listingSellerId: listing?.seller_id ?? null,
        listingStatus: listing?.status ?? null,
        listingModerationStatus: listing?.moderation_status ?? null,
        sellerApprovalStatus: listing?.seller_approval_status ?? null,
        sellerIsSuspended: listing?.seller_is_suspended ?? null,
      });
      if (!canWrite) return { kind: "not-found" as const };

      const [existingVideo] = await tx.select({ id: mediaAssetsTable.id })
        .from(mediaAssetsTable)
        .where(and(
          eq(mediaAssetsTable.context_kind, "story"),
          eq(mediaAssetsTable.context_id, input.contextId),
          eq(mediaAssetsTable.media_type, "video"),
          ne(mediaAssetsTable.status, "deleted"),
        ))
        .limit(1)
        .for("update");
      if (isDuplicateExchangeStoryVideoSession({
        contextKind: input.contextKind,
        mediaType: input.mediaType,
        exchangeListingId: story.exchange_listing_id,
        existingVideoSession: Boolean(existingVideo),
      })) return { kind: "duplicate" as const };

      const [created] = await tx.insert(mediaAssetsTable).values(values)
        .returning({ id: mediaAssetsTable.id });
      return created ? { kind: "created" as const, asset: created } : { kind: "failed" as const };
    });
    if (result.kind === "not-found") return res.status(404).json({ error: "Media context not found." });
    if (result.kind === "duplicate") {
      return res.status(409).json({
        error: "This Exchange Spark draft already has a video upload session.",
        error_code: "SPARK_VIDEO_SESSION_EXISTS",
      });
    }
    if (result.kind === "failed") return res.status(500).json({ error: "Media upload could not be initialized." });
    asset = result.asset;
  } else {
    const [created] = await db.insert(mediaAssetsTable).values(values)
      .returning({ id: mediaAssetsTable.id });
    asset = created;
  }
  if (!asset) return res.status(500).json({ error: "Media upload could not be initialized." });

  return res.status(201).json({
    media_asset_id: asset.id,
    upload: {
      method: "PUT",
      url: `/api/media-assets/${asset.id}/upload`,
      headers: { "Content-Type": input.mimeType },
      expires_in_seconds: null,
    },
    complete_url: `/api/media-assets/${asset.id}/complete`,
  });
});

router.put("/media-assets/:id/upload", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "A raw media body is required." });
  const [asset] = await db.select().from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!)))
    .limit(1);
  if (!asset || asset.status !== "pending") return res.status(404).json({ error: "Upload session not found." });
  if (!(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Upload session not found." });
  }
  if (!isAllowedMediaSize(asset.byte_size) || req.body.length > MAX_MEDIA_BYTES) {
    return res.status(413).json({ error: "Media upload exceeds the 64 MiB limit.", error_code: "MEDIA_SIZE_INVALID" });
  }
  if (req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== asset.mime_type.toLowerCase()) {
    return res.status(415).json({ error: "Upload content type does not match the declared media type.", error_code: "MEDIA_TYPE_INVALID" });
  }
  if (req.body.length !== asset.byte_size) return res.status(409).json({ error: "Uploaded byte size does not match the declared size." });
  try {
    await putAsset(asset.original_key, req.body, asset.mime_type);
  } catch {
    return res.status(503).json({ error: "Media storage is unavailable. Retry the upload.", error_code: "MEDIA_STORAGE_UNAVAILABLE" });
  }
  return res.status(204).send();
});

router.post("/media-assets/:id/complete", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId) return res.status(400).json({ error: "Invalid media asset id." });
  const [asset] = await db.select().from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!)))
    .limit(1);
  if (!asset) return res.status(404).json({ error: "Upload session not found." });
  if (asset.status !== "pending" && asset.status !== "failed") {
    return res.json({ media_asset_id: asset.id, status: asset.status });
  }
  if (!(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Upload session not found." });
  }
  if (!isAllowedMediaSize(asset.byte_size)) {
    return res.status(413).json({ error: "Media upload exceeds the 64 MiB limit.", error_code: "MEDIA_SIZE_INVALID" });
  }
  const info = await getAssetInfo(asset.original_key);
  if (!info) return res.status(409).json({ error: "Uploaded object is not available yet." });
  if (!isAllowedMediaSize(info.contentLength)) {
    return res.status(413).json({ error: "Uploaded object exceeds the 64 MiB limit.", error_code: "MEDIA_SIZE_INVALID" });
  }
  if (info.contentLength !== asset.byte_size) {
    return res.status(409).json({ error: "Uploaded object size does not match the declared size." });
  }
  const requestId = randomUUID();
  try {
    const bytes = await getAssetBuffer(asset.original_key, MAX_MEDIA_BYTES);
    if (bytes.length !== asset.byte_size) {
      return res.status(409).json({ error: "Uploaded object size does not match the declared size.", request_id: requestId });
    }
    const metadata = await validateMediaBuffer(bytes, asset.media_type, asset.mime_type);
    await db.update(mediaAssetsTable).set({
      width: metadata.width,
      height: metadata.height,
      duration_ms: metadata.duration_ms,
      metadata: { ...asset.metadata, signature_validated: true },
      updated_at: new Date(),
    }).where(eq(mediaAssetsTable.id, asset.id));
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_OBJECT_TOO_LARGE") {
      logger.warn({ requestId, mediaAssetId: asset.id, code: "MEDIA_SIZE_INVALID" }, "media-upload: object exceeded bounded read");
      return res.status(413).json({
        media_asset_id: asset.id,
        status: "pending",
        error: "Uploaded object exceeds the 64 MiB limit.",
        error_code: "MEDIA_SIZE_INVALID",
        request_id: requestId,
      });
    }
    const code = error instanceof Error && /^MEDIA_[A-Z_]+$/.test(error.message)
      ? error.message
      : "MEDIA_VALIDATION_FAILED";
    logger.warn({ requestId, mediaAssetId: asset.id, code }, "media-upload: validation rejected");
    return res.status(422).json({
      media_asset_id: asset.id,
      status: "pending",
      error: "Uploaded file does not match supported media content.",
      error_code: code,
      request_id: requestId,
    });
  }
  try {
    const queued = await enqueueMediaAssetProcessing(asset.id, asset.media_type, asset.composition_manifest);
    if (!queued) {
      logger.warn({ requestId, mediaAssetId: asset.id }, "media-upload: processing queue unavailable");
      return res.status(503).json({
        error: "Media processing is not available.",
        error_code: "MEDIA_PROCESSING_UNAVAILABLE",
        request_id: requestId,
      });
    }
    return res.status(202).json({ media_asset_id: asset.id, status: "processing" });
  } catch {
    logger.error({ requestId, mediaAssetId: asset.id }, "media-upload: processing enqueue failed");
    return res.status(503).json({
      error: "Media processing could not be queued.",
      error_code: "MEDIA_PROCESSING_UNAVAILABLE",
      request_id: requestId,
    });
  }
});

router.delete("/media-assets/:id", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId) return res.status(400).json({ error: "Invalid media asset id." });

  // Mark it deleted before touching storage. This hides the asset immediately
  // and makes worker writes conditional on a state that can no longer advance.
  const asset = await db.transaction(async (tx) => {
    const [locked] = await tx.select({
      original_key: mediaAssetsTable.original_key,
      variant_key: mediaAssetsTable.variant_key,
      thumbnail_key: mediaAssetsTable.thumbnail_key,
    }).from(mediaAssetsTable)
      .where(and(
        eq(mediaAssetsTable.id, assetId),
        eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
      ))
      .limit(1)
      .for("update");
    if (!locked) return null;
    const [updated] = await tx.update(mediaAssetsTable)
      .set({ status: "deleted", updated_at: new Date() })
      .where(and(
        eq(mediaAssetsTable.id, assetId),
        eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
      ))
      .returning({
        original_key: mediaAssetsTable.original_key,
        variant_key: mediaAssetsTable.variant_key,
        thumbnail_key: mediaAssetsTable.thumbnail_key,
      });
    return updated ?? locked;
  });
  if (!asset) return res.status(404).json({ error: "Media asset not found." });

  try {
    for (const key of new Set([asset.original_key, asset.variant_key, asset.thumbnail_key].filter(
      (value): value is string => Boolean(value),
    ))) {
      await deleteAssetStrict(key);
    }
  } catch {
    // Retain the deleted row and its object keys, so an authorized retry can
    // finish cleanup. Never restore visibility after a partial cleanup.
    return res.status(503).json({
      error: "Media was removed but storage cleanup is incomplete. Retry deletion.",
      error_code: "MEDIA_STORAGE_CLEANUP_INCOMPLETE",
    });
  }
  return res.status(204).send();
});

router.post("/media-assets/:id/playback-grant", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId) return res.status(404).json({ error: "Spark video not found." });
  const [asset] = await db.select().from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.id, assetId)).limit(1);
  if (!asset || asset.context_kind !== "exchange_spark" || asset.media_type !== "video"
    || asset.status !== "ready" || !asset.variant_key
    || !(await canReadContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Spark video not found." });
  }
  const [viewer] = await db.select({
    token_version: usersTable.token_version,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
    trust_score: usersTable.trust_score,
  }).from(usersTable).where(eq(usersTable.id, req.authenticatedUserId!)).limit(1);
  if (!viewer || viewer.approval_status !== "approved" || viewer.is_suspended
    || viewer.trust_score !== null && viewer.trust_score <= -1) {
    return res.status(404).json({ error: "Spark video not found." });
  }
  if (req.authenticatedTokenVersion !== viewer.token_version) {
    return res.status(401).json({ error: "Session expired — please log in again.", error_code: "TOKEN_REVOKED" });
  }
  const secret = process.env["SESSION_SECRET"];
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: "Secure Spark playback is temporarily unavailable." });
  }
  const grant = issueExchangeSparkPlaybackGrant(assetId, req.authenticatedUserId!, viewer.token_version, secret, req.secure || req.protocol === "https");
  res.setHeader("Set-Cookie", grant.cookie);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  return res.json({ playback_url: `/api/media-assets/${assetId}/play`, expires_at: new Date(grant.expiresAt).toISOString() });
});

router.get("/media-assets/:id/play", async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  const claims = assetId
    ? verifyExchangeSparkPlaybackGrant(req.headers.cookie, assetId, process.env["SESSION_SECRET"])
    : null;
  if (!assetId || !claims) return res.status(404).json({ error: "Spark video not found." });
  const [viewer] = await db.select({
    token_version: usersTable.token_version,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
    trust_score: usersTable.trust_score,
  }).from(usersTable).where(eq(usersTable.id, claims.userId)).limit(1);
  if (!viewer || viewer.token_version !== claims.tokenVersion
    || viewer.approval_status !== "approved" || viewer.is_suspended
    || viewer.trust_score !== null && viewer.trust_score <= -1) {
    return res.status(404).json({ error: "Spark video not found." });
  }
  const [asset] = await db.select().from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.id, assetId)).limit(1);
  if (!asset || asset.context_kind !== "exchange_spark" || asset.media_type !== "video"
    || asset.status !== "ready" || !asset.variant_key
    || !(await canReadContext(claims.userId, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Spark video not found." });
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  return streamAssetRange(asset.variant_key, req, res, "video/mp4");
});

router.get("/media-assets/shared", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const contextKind = String(req.query.contextKind ?? "");
  const contextId = positiveId(req.query.contextId);
  if (!CONTEXT_KINDS.has(contextKind) || !contextId) {
    return res.status(400).json({ error: "contextKind and contextId are required." });
  }
  if (!(await canReadContext(req.authenticatedUserId!, contextKind, contextId))) {
    return res.status(404).json({ error: "Shared media context not found." });
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const assets = await db.select().from(mediaAssetsTable)
    .where(and(
      eq(mediaAssetsTable.context_kind, contextKind),
      eq(mediaAssetsTable.context_id, contextId),
      ne(mediaAssetsTable.status, "deleted"),
    ))
    .orderBy(desc(mediaAssetsTable.created_at))
    .limit(limit);
  return res.json({
    context: { kind: contextKind, id: contextId },
    assets: assets.map((asset) => ({
      id: asset.id,
      media_type: asset.media_type,
      mime_type: asset.mime_type,
      original_name: asset.original_name,
      byte_size: asset.byte_size,
      width: asset.width,
      height: asset.height,
      duration_ms: asset.duration_ms,
      status: asset.status,
      failure_code: asset.status === "failed"
        ? asset.failure_reason?.match(/^MEDIA_[A-Z_]+/)?.[0] ?? "MEDIA_PROCESSING_FAILED"
        : null,
      request_id: asset.status === "failed" ? asset.failure_reason?.match(/request_id=([a-f0-9-]+)/i)?.[1] ?? null : null,
      media_url: `/api/media-assets/${asset.id}`,
      thumbnail_url: asset.thumbnail_key ? `/api/media-assets/${asset.id}/thumbnail` : null,
      variant_ready: Boolean(asset.variant_key),
      created_at: asset.created_at.toISOString(),
    })),
  });
});

async function streamMediaAsset(req: Request, res: Response, thumbnail: boolean) {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId) return res.status(400).json({ error: "Invalid media asset id." });
  const [asset] = await db.select().from(mediaAssetsTable).where(eq(mediaAssetsTable.id, assetId)).limit(1);
  if (!asset || asset.status === "deleted" || !(await canReadContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Media asset not found." });
  }
  if (asset.status !== "ready") {
    return res.status(409).json({ error: "Media is not ready for playback.", status: asset.status });
  }
  const key = thumbnail ? asset.thumbnail_key : (asset.variant_key ?? asset.original_key);
  if (!key) return res.status(409).json({ error: "Media variant is still processing." });
  return streamAssetRange(key, req, res, thumbnail ? "image/jpeg" : asset.variant_key ? "video/mp4" : asset.mime_type);
}

router.get("/media-assets/:id/thumbnail", requireAuth, requireApproved, generalApiLimiter, (req, res) => streamMediaAsset(req, res, true));
router.get("/media-assets/:id", requireAuth, requireApproved, generalApiLimiter, (req, res) => streamMediaAsset(req, res, false));

export default router;