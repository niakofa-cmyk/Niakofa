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
  hubMembershipsTable,
  mediaAssetsTable,
  requestsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { getAssetBuffer, getAssetInfo, getAssetUploadUrl, putAsset, streamAssetRange } from "../lib/storage";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { enqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue";
import { mediaProcessingQueue } from "../lib/queue";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isAllowedMediaSize, MAX_MEDIA_BYTES, validateMediaBuffer } from "../lib/media-validation";
import { logger } from "../lib/logger";
import {
  canReadCommunityStoryAudience,
  canReadExchangeLinkedStory,
  canWriteStoryMediaContext,
  isDuplicateExchangeStoryVideoSession,
} from "../lib/community-story-policy";

const router = Router();
const CONTEXT_KINDS = new Set(["story", "direct", "request", "hub"]);

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
  return canReadContext(userId, contextKind, contextId);
}

function disabled(res: Response) {
  return res.status(404).json({
    error: "Universal media is not enabled in this environment.",
    error_code: "MEDIA_PLATFORM_DISABLED",
  });
}

const uploadRequestSchema = z.object({
  contextKind: z.enum(["story", "direct", "request", "hub"]),
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
  if (input.contextKind === "story" && input.mediaType === "video") {
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
    const signedUrl = await getAssetUploadUrl(key, input.mimeType);
    return res.status(201).json({
      media_asset_id: asset.id,
      upload: {
        method: "PUT",
        url: signedUrl ?? `/api/media-assets/${asset.id}/upload`,
        headers: { "Content-Type": input.mimeType },
        expires_in_seconds: signedUrl ? 900 : null,
      },
      complete_url: `/api/media-assets/${asset.id}/complete`,
    });
  } catch {
    await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, asset.id));
    return res.status(503).json({ error: "Object storage is not ready.", error_code: "MEDIA_STORAGE_UNAVAILABLE" });
  }
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
  if (req.body.length !== asset.byte_size) return res.status(409).json({ error: "Uploaded byte size does not match the declared size." });
  await putAsset(asset.original_key, req.body, asset.mime_type);
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