import express, { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryMomentCompositionsTable,
  db,
  directConversationMembersTable,
  directMessageBlocksTable,
  directConversationsTable,
  diasporaHubsTable,
  exchangeListingsTable,
  exchangeSparksTable,
  hubMembershipsTable,
  mediaAssetsTable,
  mediaUploadChunksTable,
  mediaUploadSessionsTable,
  requestsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { deleteAssetStrict, getAssetBuffer, getAssetInfo, putAsset, streamAssetRange } from "../lib/storage";
import { buildMomentMusicRightsMetadata, isMediaPlatformV21Enabled, isMomentMusicAsset } from "../lib/media-platform";
import { enqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue";
import { mediaProcessingQueue } from "../lib/queue";
import { createHash, randomUUID } from "node:crypto";
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
import { mediaStorageKeys } from "../lib/media-cleanup";
import {
  chunkStorageKey,
  cleanupFinalizedChunkObjects,
  decideMediaChunk,
  MEDIA_UPLOAD_CHUNK_SIZE,
  MEDIA_UPLOAD_MAX_BYTES,
} from "../lib/resumable-media-upload";
import { classifyMediaChunkFailure, type MediaChunkFailureStage } from "../lib/media-upload-failure";

const router = Router();
const CONTEXT_KINDS = new Set([
  "story",
  "exchange_spark",
  "direct",
  "request",
  "hub",
  "community_moment",
  "hub_moment",
]);

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
  musicRights: z.object({
    confirmed: z.literal(true),
    basis: z.enum(["original", "licensed"]),
    licenseReference: z.string().trim().max(1000).url().optional(),
  }).optional(),
}).superRefine((input, context) => {
  if (["community_moment", "hub_moment"].includes(input.contextKind)
    && input.mediaType === "audio" && !input.musicRights) {
    context.addIssue({
      code: "custom",
      path: ["musicRights"],
      message: "Community and Hub Moment audio requires a creator rights attestation.",
    });
  }
  if (!input.musicRights) return;
  if (!["community_moment", "hub_moment"].includes(input.contextKind) || input.mediaType !== "audio"
    || !input.mimeType.startsWith("audio/")) {
    context.addIssue({
      code: "custom",
      path: ["musicRights"],
      message: "Moment music rights can only be attested for an audio upload to a Community or Hub Moment.",
    });
  }
  if (input.musicRights.basis === "licensed"
    && (!input.musicRights.licenseReference || !input.musicRights.licenseReference.startsWith("https://"))) {
    context.addIssue({
      code: "custom",
      path: ["musicRights", "licenseReference"],
      message: "A licensed track needs an HTTPS link to its license or source.",
    });
  }
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
    metadata: input.musicRights
      ? buildMomentMusicRightsMetadata(req.authenticatedUserId!, input.musicRights)
      : {},
  };
  let asset: { id: number } | undefined;
  if (input.contextKind === "exchange_spark" && input.mediaType === "video") {
    const result = await db.transaction(async (tx) => {
      const [sparkReference] = await tx.select({
        listing_id: exchangeSparksTable.listing_id,
      }).from(exchangeSparksTable)
        .where(eq(exchangeSparksTable.id, input.contextId))
        .limit(1);
      if (!sparkReference) return { kind: "not-found" as const };

      // Publish locks the linked listing before the Spark. Keep the same
      // order here so an upload initialization cannot deadlock publication.
      const [listing] = await tx.select({
        seller_id: exchangeListingsTable.seller_id,
        status: exchangeListingsTable.status,
        moderation_status: exchangeListingsTable.moderation_status,
        seller_approval_status: usersTable.approval_status,
        seller_is_suspended: usersTable.is_suspended,
      }).from(exchangeListingsTable)
        .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
        .where(eq(exchangeListingsTable.id, sparkReference.listing_id))
        .limit(1)
        .for("update");
      if (!listing || listing.seller_id !== req.authenticatedUserId
        || listing.status !== "active"
        || listing.moderation_status !== "approved"
        || listing.seller_approval_status !== "approved"
        || listing.seller_is_suspended) return { kind: "not-found" as const };

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
  try {
    await db.insert(mediaUploadSessionsTable).values({
      media_asset_id: asset.id,
      chunk_size: MEDIA_UPLOAD_CHUNK_SIZE,
      next_offset: 0,
      finalized: false,
    });
  } catch {
    return res.status(500).json({ error: "Resumable media upload could not be initialized." });
  }

  return res.status(201).json({
    media_asset_id: asset.id,
    upload: {
      method: "PUT",
      url: `/api/media-assets/${asset.id}/upload`,
      headers: { "Content-Type": input.mimeType },
      expires_in_seconds: null,
    },
    resumable: {
      chunk_size: MEDIA_UPLOAD_CHUNK_SIZE,
      status_url: `/api/media-assets/${asset.id}/upload-session`,
      chunk_url: `/api/media-assets/${asset.id}/upload/chunks`,
    },
    complete_url: `/api/media-assets/${asset.id}/complete`,
  });
});

router.get("/media-assets/:id/upload-session", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId) return res.status(400).json({ error: "Invalid media asset id." });
  const [session] = await db.select({
    owner_user_id: mediaAssetsTable.owner_user_id,
    context_kind: mediaAssetsTable.context_kind,
    context_id: mediaAssetsTable.context_id,
    byte_size: mediaAssetsTable.byte_size,
    status: mediaAssetsTable.status,
    chunk_size: mediaUploadSessionsTable.chunk_size,
    next_offset: mediaUploadSessionsTable.next_offset,
    finalized: mediaUploadSessionsTable.finalized,
  }).from(mediaUploadSessionsTable)
    .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, mediaUploadSessionsTable.media_asset_id))
    .where(and(
      eq(mediaAssetsTable.id, assetId),
      eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
    ))
    .limit(1);
  if (!session || session.status === "deleted"
    || !(await canWriteContext(req.authenticatedUserId!, session.context_kind, session.context_id))) {
    return res.status(404).json({ error: "Upload session not found." });
  }
  if (session.finalized) {
    const cleanup = await cleanupFinalizedMediaChunks(assetId, req.authenticatedUserId!);
    if (cleanup === "storage-failed") {
      return res.status(503).json({ error: "Finalized upload cleanup is pending. Retry upload status.", error_code: "MEDIA_STORAGE_CLEANUP_INCOMPLETE" });
    }
  }
  return res.json({
    media_asset_id: assetId,
    offset: session.next_offset,
    total_bytes: session.byte_size,
    chunk_size: session.chunk_size,
    finalized: session.finalized,
    status: session.status,
  });
});

router.put(
  "/media-assets/:id/upload/chunks",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  express.raw({ type: "application/octet-stream", limit: `${MEDIA_UPLOAD_CHUNK_SIZE}b` }),
  async (req, res) => {
    if (!isMediaPlatformV21Enabled()) return disabled(res);
    const assetId = positiveId(req.params.id);
    if (!assetId || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "A raw media chunk is required." });
    const offset = Number(req.headers["upload-offset"]);
    const digest = String(req.headers["x-chunk-sha256"] ?? "").trim().toLowerCase();
    const chunkMime = String(req.headers["x-media-mime-type"] ?? "").trim().toLowerCase();
    if (!Number.isSafeInteger(offset) || offset < 0 || !/^[0-9a-f]{64}$/.test(digest)) {
      return res.status(400).json({ error: "A valid chunk offset and SHA-256 digest are required." });
    }
    const computedDigest = createHash("sha256").update(req.body).digest("hex");
    if (computedDigest !== digest) {
      return res.status(422).json({ error: "Chunk SHA-256 digest does not match its bytes.", error_code: "MEDIA_CHUNK_CHECKSUM_INVALID" });
    }
    if (req.headers["content-length"] !== undefined && Number(req.headers["content-length"]) !== req.body.length) {
      return res.status(400).json({ error: "Chunk content length does not match its bytes." });
    }

    const objectKey = chunkStorageKey(assetId, offset, digest);
    let result: { kind: string; offset?: number } | undefined;
    let failureStage: MediaChunkFailureStage = "database_validate";
    try {
      // Validate first without touching storage. Each phase rechecks under the
      // asset/session locks because another same-offset request may win.
      const initial = await db.transaction(async (tx) => {
        const [asset] = await tx.select().from(mediaAssetsTable)
          .where(and(
            eq(mediaAssetsTable.id, assetId),
            eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
          ))
          .limit(1)
          .for("update");
        if (!asset || asset.status !== "pending"
          || !(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
          return { kind: "not-found" };
        }
        if (!isAllowedMediaSize(asset.byte_size) || asset.byte_size > MEDIA_UPLOAD_MAX_BYTES) return { kind: "too-large" };
        if (chunkMime !== asset.mime_type.toLowerCase()) return { kind: "wrong-type" };
        const [session] = await tx.select().from(mediaUploadSessionsTable)
          .where(eq(mediaUploadSessionsTable.media_asset_id, assetId))
          .limit(1)
          .for("update");
        if (!session) return { kind: "not-found" };
        const priorChunks = await tx.select({
          byte_offset: mediaUploadChunksTable.byte_offset,
          byte_length: mediaUploadChunksTable.byte_length,
          sha256: mediaUploadChunksTable.sha256,
        }).from(mediaUploadChunksTable)
          .where(eq(mediaUploadChunksTable.media_asset_id, assetId));
        const decision = decideMediaChunk({
          expectedBytes: asset.byte_size,
          chunkSize: session.chunk_size,
          nextOffset: session.next_offset,
          offset,
          chunkLength: req.body.length,
          sha256: digest,
          acceptedChunks: priorChunks,
        });
        if (decision.kind === "replay") return { kind: "stored", offset: session.next_offset };
        if (decision.kind === "conflict") return { kind: "conflict", offset: session.next_offset };
        if (decision.kind === "out-of-order") return { kind: "out-of-order", offset: session.next_offset };
        if (session.finalized) return { kind: "conflict", offset: session.next_offset };
        return { kind: "accept", offset: decision.nextOffset };
      });
      result = initial;

      if (initial.kind === "accept") {
        failureStage = "database_ledger";
        // Commit the cleanup ledger key BEFORE any provider write. A crash or
        // transaction rollback after PUT therefore leaves a discoverable key
        // for completion retry or tombstone cleanup.
        const registered = await db.transaction(async (tx) => {
          const [asset] = await tx.select().from(mediaAssetsTable)
            .where(and(
              eq(mediaAssetsTable.id, assetId),
              eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
            ))
            .limit(1)
            .for("update");
          if (!asset || asset.status !== "pending"
            || !(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
            return { kind: "not-found" };
          }
          const [session] = await tx.select().from(mediaUploadSessionsTable)
            .where(eq(mediaUploadSessionsTable.media_asset_id, assetId))
            .limit(1)
            .for("update");
          if (!session || session.finalized) return { kind: "not-found" };
          const priorChunks = await tx.select({
            byte_offset: mediaUploadChunksTable.byte_offset,
            byte_length: mediaUploadChunksTable.byte_length,
            sha256: mediaUploadChunksTable.sha256,
          }).from(mediaUploadChunksTable)
            .where(eq(mediaUploadChunksTable.media_asset_id, assetId));
          const decision = decideMediaChunk({
            expectedBytes: asset.byte_size,
            chunkSize: session.chunk_size,
            nextOffset: session.next_offset,
            offset,
            chunkLength: req.body.length,
            sha256: digest,
            acceptedChunks: priorChunks,
          });
          if (decision.kind === "replay") return { kind: "stored", offset: session.next_offset };
          if (decision.kind === "conflict") return { kind: "conflict", offset: session.next_offset };
          if (decision.kind === "out-of-order") return { kind: "out-of-order", offset: session.next_offset };
          await tx.update(mediaAssetsTable).set({
            cleanup_keys: sql`CASE
              WHEN ${mediaAssetsTable.cleanup_keys} @> jsonb_build_array(${objectKey}::text)
                THEN ${mediaAssetsTable.cleanup_keys}
              ELSE ${mediaAssetsTable.cleanup_keys} || jsonb_build_array(${objectKey}::text)
            END`,
            updated_at: new Date(),
          }).where(eq(mediaAssetsTable.id, assetId));
          return { kind: "registered", offset: decision.nextOffset };
        });
        result = registered;

        if (registered.kind === "registered") {
          failureStage = "database_lock";
          // Keep the asset lock through the provider PUT and offset commit. A
          // concurrent DELETE waits, then sees the already-durable cleanup key.
          result = await db.transaction(async (tx) => {
            const [asset] = await tx.select().from(mediaAssetsTable)
              .where(and(
                eq(mediaAssetsTable.id, assetId),
                eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
              ))
              .limit(1)
              .for("update");
            if (!asset || asset.status !== "pending"
              || !(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
              return { kind: "not-found" };
            }
            const [session] = await tx.select().from(mediaUploadSessionsTable)
              .where(eq(mediaUploadSessionsTable.media_asset_id, assetId))
              .limit(1)
              .for("update");
            if (!session || session.finalized) return { kind: "not-found" };
            const priorChunks = await tx.select({
              byte_offset: mediaUploadChunksTable.byte_offset,
              byte_length: mediaUploadChunksTable.byte_length,
              sha256: mediaUploadChunksTable.sha256,
            }).from(mediaUploadChunksTable)
              .where(eq(mediaUploadChunksTable.media_asset_id, assetId));
            const decision = decideMediaChunk({
              expectedBytes: asset.byte_size,
              chunkSize: session.chunk_size,
              nextOffset: session.next_offset,
              offset,
              chunkLength: req.body.length,
              sha256: digest,
              acceptedChunks: priorChunks,
            });
            if (decision.kind === "replay") return { kind: "stored", offset: session.next_offset };
            if (decision.kind === "conflict") return { kind: "conflict", offset: session.next_offset };
            if (decision.kind === "out-of-order") return { kind: "out-of-order", offset: session.next_offset };
            failureStage = "storage_put";
            await putAsset(objectKey, req.body, "application/octet-stream");
            failureStage = "database_commit";
            await tx.insert(mediaUploadChunksTable).values({
              media_asset_id: assetId,
              byte_offset: offset,
              byte_length: req.body.length,
              sha256: digest,
              object_key: objectKey,
            });
            await tx.update(mediaUploadSessionsTable).set({
              next_offset: decision.nextOffset,
              updated_at: new Date(),
            }).where(eq(mediaUploadSessionsTable.media_asset_id, assetId));
            return { kind: "stored", offset: decision.nextOffset };
          });
        }
      }
    } catch (error) {
      // The durable cleanup ledger was committed before the provider write.
      // Emit only fixed classifications; never log the underlying error, key,
      // asset/user IDs, or request payload.
      logger.error({
        stage: failureStage,
        failure_class: classifyMediaChunkFailure(failureStage, error),
      }, "media-upload: resumable chunk write failed");
      return res.status(503).json({ error: "Media chunk could not be stored. Retry the chunk.", error_code: "MEDIA_STORAGE_UNAVAILABLE" });
    }

    if (result?.kind === "not-found") return res.status(404).json({ error: "Upload session not found." });
    if (result?.kind === "too-large") return res.status(413).json({ error: "Media upload exceeds the 64 MiB limit.", error_code: "MEDIA_SIZE_INVALID" });
    if (result?.kind === "wrong-type") return res.status(415).json({ error: "Chunk MIME type does not match the declared media MIME type.", error_code: "MEDIA_TYPE_INVALID" });
    if (result?.kind === "conflict") return res.status(409).json({ error: "Chunk conflicts with the accepted upload bytes.", upload_offset: result.offset });
    if (result?.kind === "out-of-order") return res.status(409).json({ error: "Chunks must be uploaded in order.", upload_offset: result.offset });
    res.setHeader("Upload-Offset", String(result?.offset ?? 0));
    return res.status(204).send();
  },
);

router.put("/media-assets/:id/upload", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "A raw media body is required." });
  const result = await db.transaction(async (tx) => {
    // Hold the row lock through the object PUT. Deletion locks the same row,
    // so either this write finishes before tombstoning/cleanup, or it sees the
    // tombstone and cannot recreate the deleted object afterward.
    const [asset] = await tx.select().from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!)))
      .limit(1)
      .for("update");
    if (!asset || asset.status !== "pending") return "not-found" as const;
    if (!(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
      return "not-found" as const;
    }
    const [resumable] = await tx.select({ next_offset: mediaUploadSessionsTable.next_offset })
      .from(mediaUploadSessionsTable)
      .where(eq(mediaUploadSessionsTable.media_asset_id, assetId))
      .limit(1);
    if (resumable && resumable.next_offset > 0) return "wrong-size" as const;
    if (!isAllowedMediaSize(asset.byte_size) || req.body.length > MAX_MEDIA_BYTES) return "too-large" as const;
    if (req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== asset.mime_type.toLowerCase()) {
      return "wrong-type" as const;
    }
    if (req.body.length !== asset.byte_size) return "wrong-size" as const;
    try {
      await putAsset(asset.original_key, req.body, asset.mime_type);
    } catch {
      return "storage-failed" as const;
    }
    return "stored" as const;
  });
  if (result === "not-found") return res.status(404).json({ error: "Upload session not found." });
  if (result === "too-large") {
    return res.status(413).json({ error: "Media upload exceeds the 64 MiB limit.", error_code: "MEDIA_SIZE_INVALID" });
  }
  if (result === "wrong-type") {
    return res.status(415).json({ error: "Upload content type does not match the declared media type.", error_code: "MEDIA_TYPE_INVALID" });
  }
  if (result === "wrong-size") return res.status(409).json({ error: "Uploaded byte size does not match the declared size." });
  if (result === "storage-failed") {
    return res.status(503).json({ error: "Media storage is unavailable. Retry the upload.", error_code: "MEDIA_STORAGE_UNAVAILABLE" });
  }
  return res.status(204).send();
});

async function assembleResumableMedia(assetId: number, ownerUserId: number):
Promise<"stored" | "incomplete" | "not-found" | "storage-failed" | "invalid"> {
  return db.transaction(async (tx) => {
    const [asset] = await tx.select().from(mediaAssetsTable)
      .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.owner_user_id, ownerUserId)))
      .limit(1)
      .for("update");
    if (!asset || (asset.status !== "pending" && asset.status !== "failed")
      || !(await canWriteContext(ownerUserId, asset.context_kind, asset.context_id))) return "not-found";
    const [session] = await tx.select().from(mediaUploadSessionsTable)
      .where(eq(mediaUploadSessionsTable.media_asset_id, assetId))
      .limit(1)
      .for("update");
    if (!session) return "incomplete";
    if (!session.finalized && session.next_offset !== asset.byte_size) return "incomplete";

    const chunks = await tx.select().from(mediaUploadChunksTable)
      .where(eq(mediaUploadChunksTable.media_asset_id, assetId))
      .orderBy(asc(mediaUploadChunksTable.byte_offset));
    if (!session.finalized) {
      let expectedOffset = 0;
      const buffers: Buffer[] = [];
      try {
        for (const chunk of chunks) {
          if (chunk.byte_offset !== expectedOffset || chunk.byte_length <= 0
            || chunk.byte_length > session.chunk_size) return "incomplete";
          const bytes = await getAssetBuffer(chunk.object_key, session.chunk_size);
          if (bytes.length !== chunk.byte_length
            || createHash("sha256").update(bytes).digest("hex") !== chunk.sha256) return "invalid";
          buffers.push(bytes);
          expectedOffset += bytes.length;
        }
        if (expectedOffset !== asset.byte_size) return "incomplete";
        const fullMedia = Buffer.concat(buffers, expectedOffset);
        if (fullMedia.length !== asset.byte_size || !isAllowedMediaSize(fullMedia.length)) return "invalid";
        await putAsset(asset.original_key, fullMedia, asset.mime_type);
      } catch {
        return "storage-failed";
      }
      await tx.update(mediaUploadSessionsTable).set({
        finalized: true,
        updated_at: new Date(),
      }).where(eq(mediaUploadSessionsTable.media_asset_id, assetId));
    }

    return "stored";
  });
}

/**
 * Finalization commits before provider deletes. The cleanup_keys ledger and
 * chunk rows remain intact until every strict delete succeeds; a failed DB
 * cleanup transaction is safe to retry because finalized media no longer
 * depends on the chunk objects.
 */
async function cleanupFinalizedMediaChunks(assetId: number, ownerUserId: number):
Promise<"clean" | "not-finalized" | "storage-failed"> {
  const [state] = await db.select({
    status: mediaAssetsTable.status,
    cleanup_keys: mediaAssetsTable.cleanup_keys,
    finalized: mediaUploadSessionsTable.finalized,
  }).from(mediaAssetsTable)
    .innerJoin(mediaUploadSessionsTable, eq(mediaUploadSessionsTable.media_asset_id, mediaAssetsTable.id))
    .where(and(
      eq(mediaAssetsTable.id, assetId),
      eq(mediaAssetsTable.owner_user_id, ownerUserId),
    ))
    .limit(1);
  if (!state || !state.finalized || state.status === "deleted") return "not-finalized";
  const chunkKeys = new Set<string>([
    ...((state.cleanup_keys ?? []).filter((key) => key.startsWith(`media-assets/${assetId}/upload-chunks/`))),
    ...(await db.select({ object_key: mediaUploadChunksTable.object_key })
      .from(mediaUploadChunksTable)
      .where(eq(mediaUploadChunksTable.media_asset_id, assetId))).map((chunk) => chunk.object_key),
  ]);
  if (chunkKeys.size) {
    const cleaned = await cleanupFinalizedChunkObjects(
      [...chunkKeys],
      deleteAssetStrict,
      async () => {
        await db.transaction(async (tx) => {
        const [asset] = await tx.select().from(mediaAssetsTable)
          .where(and(
            eq(mediaAssetsTable.id, assetId),
            eq(mediaAssetsTable.owner_user_id, ownerUserId),
          ))
          .limit(1)
          .for("update");
        if (!asset) return;
        await tx.delete(mediaUploadChunksTable)
          .where(and(
            eq(mediaUploadChunksTable.media_asset_id, assetId),
            inArray(mediaUploadChunksTable.object_key, [...chunkKeys]),
          ));
        await tx.update(mediaAssetsTable).set({
          cleanup_keys: (asset.cleanup_keys ?? []).filter((key) => !chunkKeys.has(key)),
          updated_at: new Date(),
        }).where(eq(mediaAssetsTable.id, assetId));
        });
      },
    );
    if (!cleaned) return "storage-failed";
  }
  return "clean";
}

router.post("/media-assets/:id/complete", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return disabled(res);
  const assetId = positiveId(req.params.id);
  if (!assetId) return res.status(400).json({ error: "Invalid media asset id." });
  const [asset] = await db.select().from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!)))
    .limit(1);
  if (!asset) return res.status(404).json({ error: "Upload session not found." });
  if (asset.status !== "pending" && asset.status !== "failed") {
    const cleanup = await cleanupFinalizedMediaChunks(asset.id, req.authenticatedUserId!);
    if (cleanup === "storage-failed") {
      return res.status(503).json({ error: "Finalized upload cleanup is pending. Retry completion.", error_code: "MEDIA_STORAGE_CLEANUP_INCOMPLETE" });
    }
    return res.json({ media_asset_id: asset.id, status: asset.status });
  }
  if (!(await canWriteContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Upload session not found." });
  }
  if (!isAllowedMediaSize(asset.byte_size)) {
    return res.status(413).json({ error: "Media upload exceeds the 64 MiB limit.", error_code: "MEDIA_SIZE_INVALID" });
  }
  const [resumable] = await db.select({
    next_offset: mediaUploadSessionsTable.next_offset,
    finalized: mediaUploadSessionsTable.finalized,
  }).from(mediaUploadSessionsTable)
    .where(eq(mediaUploadSessionsTable.media_asset_id, asset.id))
    .limit(1);
  if (resumable && (resumable.next_offset > 0 || resumable.finalized)) {
    const assembled = await assembleResumableMedia(asset.id, req.authenticatedUserId!);
    if (assembled === "not-found") return res.status(404).json({ error: "Upload session not found." });
    if (assembled === "incomplete") {
      return res.status(409).json({
        error: "The upload is incomplete.",
        error_code: "MEDIA_UPLOAD_INCOMPLETE",
        upload_offset: resumable.next_offset,
        expected_bytes: asset.byte_size,
      });
    }
    if (assembled === "invalid") {
      return res.status(422).json({ error: "Stored upload chunks failed integrity validation.", error_code: "MEDIA_CHUNK_CHECKSUM_INVALID" });
    }
    if (assembled === "storage-failed") {
      return res.status(503).json({ error: "Media chunks could not be assembled or cleaned up. Retry completion.", error_code: "MEDIA_STORAGE_UNAVAILABLE" });
    }
    const cleanup = await cleanupFinalizedMediaChunks(asset.id, req.authenticatedUserId!);
    if (cleanup === "storage-failed") {
      return res.status(503).json({ error: "Media chunks were assembled, but cleanup is pending. Retry completion.", error_code: "MEDIA_STORAGE_CLEANUP_INCOMPLETE" });
    }
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
    const [validatedAsset] = await db.update(mediaAssetsTable).set({
      width: metadata.width,
      height: metadata.height,
      duration_ms: metadata.duration_ms,
      metadata: { ...asset.metadata, signature_validated: true },
      updated_at: new Date(),
    }).where(and(
      eq(mediaAssetsTable.id, asset.id),
      eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
      inArray(mediaAssetsTable.status, ["pending", "failed"]),
    )).returning({ id: mediaAssetsTable.id });
    if (!validatedAsset) {
      return res.status(404).json({ error: "Upload session not found." });
    }
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
      cleanup_keys: mediaAssetsTable.cleanup_keys,
      metadata: mediaAssetsTable.metadata,
      context_kind: mediaAssetsTable.context_kind,
    }).from(mediaAssetsTable)
      .where(and(
        eq(mediaAssetsTable.id, assetId),
        eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
      ))
      .limit(1)
      .for("update");
    if (!locked) return null;
    if (locked.context_kind === "story" && isMomentMusicAsset(locked.metadata, req.authenticatedUserId!)) {
      return { kind: "music_attached" as const };
    }
    const [updated] = await tx.update(mediaAssetsTable)
      .set({
        status: "deleted",
        metadata: sql`jsonb_set(${mediaAssetsTable.metadata}, '{storage_cleanup_pending}', 'true'::jsonb, true)`,
        updated_at: new Date(),
      })
      .where(and(
        eq(mediaAssetsTable.id, assetId),
        eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
      ))
      .returning({
        original_key: mediaAssetsTable.original_key,
        variant_key: mediaAssetsTable.variant_key,
        thumbnail_key: mediaAssetsTable.thumbnail_key,
        cleanup_keys: mediaAssetsTable.cleanup_keys,
        metadata: mediaAssetsTable.metadata,
      });
    return updated ?? locked;
  });
  if (!asset) return res.status(404).json({ error: "Media asset not found." });
  if ("kind" in asset) {
    return res.status(409).json({
      error: "This soundtrack is linked to a published Moment. Delete the Moment to remove both the mixed video and its music.",
      error_code: "MOMENT_MUSIC_LINKED",
    });
  }

  try {
    for (const key of mediaStorageKeys(asset)) {
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
  await db.update(mediaAssetsTable)
    .set({
      metadata: sql`jsonb_set(${mediaAssetsTable.metadata}, '{storage_cleanup_pending}', 'false'::jsonb, true)`,
      updated_at: new Date(),
    })
    .where(and(eq(mediaAssetsTable.id, assetId), eq(mediaAssetsTable.status, "deleted")));
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
  if (asset) {
    const [composition] = await db.select({ id: communityStoryMomentCompositionsTable.id })
      .from(communityStoryMomentCompositionsTable)
      .where(eq(communityStoryMomentCompositionsTable.derived_media_asset_id, assetId))
      .limit(1);
    if (composition || asset.metadata?.derived_kind === "moment_camera_clip_reel") {
      return res.status(404).json({ error: "Media asset not found." });
    }
  }
  if (!asset || asset.status === "deleted" || !(await canReadContext(req.authenticatedUserId!, asset.context_kind, asset.context_id))) {
    return res.status(404).json({ error: "Media asset not found." });
  }
  if (asset.status !== "ready") {
    return res.status(409).json({ error: "Media is not ready for playback.", status: asset.status });
  }
  const key = thumbnail ? asset.thumbnail_key : (asset.variant_key ?? asset.original_key);
  if (!key) return res.status(409).json({ error: "Media variant is still processing." });
  if (!thumbnail && asset.context_kind === "exchange_spark" && asset.media_type === "video") {
    const claims = verifyExchangeSparkPlaybackGrant(
      req.headers.cookie,
      asset.id,
      process.env["SESSION_SECRET"],
    );
    const [viewer] = await db.select({
      id: usersTable.id,
      token_version: usersTable.token_version,
      trust_score: usersTable.trust_score,
    }).from(usersTable).where(eq(usersTable.id, req.authenticatedUserId!)).limit(1);
    if (!claims || claims.userId !== req.authenticatedUserId
      || !viewer || claims.tokenVersion !== viewer.token_version
      || viewer.trust_score !== null && viewer.trust_score <= -1) {
      return res.status(404).json({ error: "Media asset not found." });
    }
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  return streamAssetRange(key, req, res, thumbnail ? "image/jpeg" : asset.variant_key ? "video/mp4" : asset.mime_type);
}

router.get("/media-assets/:id/thumbnail", requireAuth, requireApproved, generalApiLimiter, (req, res) => streamMediaAsset(req, res, true));
router.get("/media-assets/:id", requireAuth, requireApproved, generalApiLimiter, (req, res) => streamMediaAsset(req, res, false));

export default router;