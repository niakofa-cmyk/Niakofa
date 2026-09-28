import { Router, type Response } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryMediaTable,
  db,
  exchangeListingsTable,
  mediaAssetsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { mediaProcessingQueue } from "../lib/queue";
import { getStorageReadiness } from "../lib/storageReadiness";
import {
  exchangeSparkFeatureUnavailableCode,
  safeExchangeSparkFailureCode,
  singlePublishableExchangeSparkAsset,
} from "../lib/community-exchange-spark-drafts";
import { z } from "zod";

const router = Router();

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanCaption(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 1000)
    : "";
}

function featureUnavailableCode(): string | null {
  const storage = getStorageReadiness();
  return exchangeSparkFeatureUnavailableCode({
    v21Enabled: isMediaPlatformV21Enabled(),
    cloudStorageReady: storage.cloud_configured && storage.credentials_present && storage.missing.length === 0,
    queueReady: Boolean(mediaProcessingQueue),
  });
}

const createDraftSchema = z.object({
  caption: z.string().trim().max(1000).optional().default(""),
});
const publishSchema = z.object({
  caption: z.string().trim().max(1000).optional(),
});

async function eligibleListing(listingId: number, userId: number) {
  const [listing] = await db.select({
    id: exchangeListingsTable.id,
    seller_id: exchangeListingsTable.seller_id,
    community_id: usersTable.community_id,
  }).from(exchangeListingsTable)
    .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
    .where(and(
      eq(exchangeListingsTable.id, listingId),
      eq(exchangeListingsTable.seller_id, userId),
      eq(exchangeListingsTable.status, "active"),
      eq(exchangeListingsTable.moderation_status, "approved"),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
    ))
    .limit(1);
  return listing ?? null;
}

function featureUnavailableResponse(res: Response, code: string) {
  return res.status(503).json({
    error: code === "MEDIA_PLATFORM_DISABLED"
      ? "Direct-binary Exchange Spark publishing is not enabled in this environment."
      : code === "MEDIA_STORAGE_UNAVAILABLE"
        ? "Cloud storage is not ready for Exchange Spark publishing."
        : "Media processing is not available for Exchange Spark publishing.",
    error_code: code,
  });
}

router.post(
  "/community/exchange/listings/:listingId/sparks/drafts",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const code = featureUnavailableCode();
    if (code) return featureUnavailableResponse(res, code);

    const listingId = positiveId(req.params.listingId);
    if (!listingId) return res.status(400).json({ error: "Invalid Exchange listing id." });
    const parsed = createDraftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Spark draft data is invalid." });

    const userId = req.authenticatedUserId!;
    const listing = await eligibleListing(listingId, userId);
    if (!listing) return res.status(404).json({ error: "An active, approved Exchange listing you own is required." });
    const [story] = await db.insert(communityStoriesTable).values({
      author_user_id: userId,
      community_id: listing.community_id,
      exchange_listing_id: listing.id,
      caption: cleanCaption(parsed.data.caption) || null,
      audience: "community",
      status: "draft",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }).returning({ id: communityStoriesTable.id });
    if (!story) return res.status(500).json({ error: "Spark draft could not be created." });

    return res.status(201).json({
      spark_id: story.id,
      status: "draft",
      upload_context: { contextKind: "story", contextId: story.id },
    });
  },
);

router.get(
  "/community/exchange/sparks/drafts/:sparkId",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const code = featureUnavailableCode();
    if (code) return featureUnavailableResponse(res, code);

    const sparkId = positiveId(req.params.sparkId);
    if (!sparkId) return res.status(404).json({ error: "Spark draft not found." });
    const userId = req.authenticatedUserId!;
    const [story] = await db.select({
      id: communityStoriesTable.id,
      status: communityStoriesTable.status,
      caption: communityStoriesTable.caption,
      expires_at: communityStoriesTable.expires_at,
    }).from(communityStoriesTable)
      .where(and(
        eq(communityStoriesTable.id, sparkId),
        eq(communityStoriesTable.author_user_id, userId),
        isNotNull(communityStoriesTable.exchange_listing_id),
      ))
      .limit(1);
    if (!story || story.status !== "draft" || story.expires_at <= new Date()) {
      return res.status(404).json({ error: "Spark draft not found." });
    }

    const assets = await db.select({
      id: mediaAssetsTable.id,
      media_type: mediaAssetsTable.media_type,
      mime_type: mediaAssetsTable.mime_type,
      status: mediaAssetsTable.status,
      duration_ms: mediaAssetsTable.duration_ms,
      variant_key: mediaAssetsTable.variant_key,
      failure_reason: mediaAssetsTable.failure_reason,
    }).from(mediaAssetsTable)
      .where(and(
        eq(mediaAssetsTable.context_kind, "story"),
        eq(mediaAssetsTable.context_id, sparkId),
        eq(mediaAssetsTable.owner_user_id, userId),
      ));
    return res.json({
      spark_id: sparkId,
      status: story.status,
      caption: story.caption,
      expires_at: story.expires_at.toISOString(),
      media_assets: assets.map((asset) => ({
        media_asset_id: asset.id,
        media_type: asset.media_type,
        mime_type: asset.mime_type,
        status: asset.status,
        duration_ms: asset.duration_ms,
        variant_ready: asset.status === "ready" && Boolean(asset.variant_key),
        error_code: asset.status === "failed" ? safeExchangeSparkFailureCode(asset.failure_reason) : null,
      })),
    });
  },
);

router.post(
  "/community/exchange/sparks/drafts/:sparkId/publish",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const code = featureUnavailableCode();
    if (code) return featureUnavailableResponse(res, code);

    const sparkId = positiveId(req.params.sparkId);
    if (!sparkId) return res.status(404).json({ error: "Spark draft not found." });
    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Spark publication data is invalid." });
    const userId = req.authenticatedUserId!;

    const result = await db.transaction(async (tx) => {
      const [storyReference] = await tx.select({
        id: communityStoriesTable.id,
        exchange_listing_id: communityStoriesTable.exchange_listing_id,
      }).from(communityStoriesTable)
        .where(and(
          eq(communityStoriesTable.id, sparkId),
          eq(communityStoriesTable.author_user_id, userId),
        ))
        .limit(1);
      if (!storyReference || storyReference.exchange_listing_id === null) return { kind: "not-found" as const };

      const [listing] = await tx.select({
        id: exchangeListingsTable.id,
        seller_id: exchangeListingsTable.seller_id,
        community_id: usersTable.community_id,
      }).from(exchangeListingsTable)
        .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
        .where(and(
          eq(exchangeListingsTable.id, storyReference.exchange_listing_id),
          eq(exchangeListingsTable.seller_id, userId),
          eq(exchangeListingsTable.status, "active"),
          eq(exchangeListingsTable.moderation_status, "approved"),
          eq(usersTable.approval_status, "approved"),
          eq(usersTable.is_suspended, false),
        ))
        .limit(1)
        .for("update");
      if (!listing) return { kind: "conflict" as const, error: "The linked Exchange listing is no longer eligible." };

      const [story] = await tx.select({
        id: communityStoriesTable.id,
        author_user_id: communityStoriesTable.author_user_id,
        community_id: communityStoriesTable.community_id,
        exchange_listing_id: communityStoriesTable.exchange_listing_id,
        status: communityStoriesTable.status,
        caption: communityStoriesTable.caption,
        expires_at: communityStoriesTable.expires_at,
      }).from(communityStoriesTable)
        .where(and(
          eq(communityStoriesTable.id, sparkId),
          eq(communityStoriesTable.author_user_id, userId),
          eq(communityStoriesTable.exchange_listing_id, storyReference.exchange_listing_id),
        ))
        .limit(1)
        .for("update");
      if (!story || story.status === "deletion_pending") return { kind: "not-found" as const };
      if (story.expires_at <= new Date()) return { kind: "conflict" as const, error: "Spark draft has expired." };

      const assets = await tx.select().from(mediaAssetsTable)
        .where(and(
          eq(mediaAssetsTable.context_kind, "story"),
          eq(mediaAssetsTable.context_id, sparkId),
        ))
        .for("update");
      const asset = singlePublishableExchangeSparkAsset(assets, userId, sparkId);
      if (!asset) {
        return { kind: "conflict" as const, error: "Exactly one ready, validated video asset under 60 seconds is required." };
      }
      const caption = cleanCaption(parsed.data.caption ?? story.caption) || null;
      const moderation = moderatePostText(caption ?? "");

      const existingMedia = await tx.select({
        id: communityStoryMediaTable.id,
        media_asset_id: communityStoryMediaTable.media_asset_id,
      }).from(communityStoryMediaTable)
        .where(eq(communityStoryMediaTable.story_id, sparkId))
        .for("update");

      if (story.status !== "draft") {
        if ((story.status === "published" || story.status === "pending")
          && existingMedia.length === 1
          && existingMedia[0]?.media_asset_id === asset.id) {
          return { kind: "published" as const, status: story.status, mediaAssetId: asset.id };
        }
        return { kind: "conflict" as const, error: "Spark draft cannot be published in its current state." };
      }
      if (existingMedia.length) return { kind: "conflict" as const, error: "Spark draft already has attached media." };

      await tx.insert(communityStoryMediaTable).values({
        story_id: sparkId,
        media_asset_id: asset.id,
        storage_key: asset.original_key,
        media_type: "video",
        mime_type: asset.mime_type,
        byte_size: asset.byte_size,
        duration_ms: asset.duration_ms,
        width: asset.width,
        height: asset.height,
      });
      await tx.update(communityStoriesTable).set({
        caption,
        community_id: listing.community_id,
        audience: "community",
        status: moderation.status === "approved" ? "published" : "pending",
      }).where(eq(communityStoriesTable.id, sparkId));
      return {
        kind: "published" as const,
        status: moderation.status === "approved" ? "published" : "pending",
        mediaAssetId: asset.id,
      };
    });

    if (result.kind === "not-found") return res.status(404).json({ error: "Spark draft not found." });
    if (result.kind === "conflict") return res.status(409).json({ error: result.error });
    return res.status(201).json({
      spark_id: sparkId,
      status: result.status,
      media_asset_id: result.mediaAssetId,
    });
  },
);

export default router;