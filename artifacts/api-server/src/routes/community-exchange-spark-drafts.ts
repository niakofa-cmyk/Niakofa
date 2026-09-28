import { Router, type Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import {
  db,
  exchangeSparksTable,
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
const updateDraftSchema = z.object({
  caption: z.string().trim().max(1000),
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
    const [spark] = await db.insert(exchangeSparksTable).values({
      listing_id: listing.id,
      author_user_id: userId,
      community_id: listing.community_id,
      caption: cleanCaption(parsed.data.caption) || null,
      status: "draft",
    }).returning({ id: exchangeSparksTable.id });
    if (!spark) return res.status(500).json({ error: "Spark draft could not be created." });

    return res.status(201).json({
      spark_id: spark.id,
      status: "draft",
      upload_context: { contextKind: "exchange_spark", contextId: spark.id },
    });
  },
);

router.get(
  "/community/exchange/sparks/drafts",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const now = new Date();
    const sparks = await db.select({
      id: exchangeSparksTable.id,
      listing_id: exchangeSparksTable.listing_id,
      status: exchangeSparksTable.status,
      caption: exchangeSparksTable.caption,
      draft_expires_at: exchangeSparksTable.draft_expires_at,
      created_at: exchangeSparksTable.created_at,
    }).from(exchangeSparksTable)
      .where(and(
        eq(exchangeSparksTable.author_user_id, req.authenticatedUserId!),
        eq(exchangeSparksTable.status, "draft"),
      ));
    const activeDrafts = sparks.filter((spark) => spark.draft_expires_at > now);
    const drafts = await Promise.all(activeDrafts.map(async (spark) => {
      const assets = await db.select({
        id: mediaAssetsTable.id,
        media_type: mediaAssetsTable.media_type,
        mime_type: mediaAssetsTable.mime_type,
        byte_size: mediaAssetsTable.byte_size,
        status: mediaAssetsTable.status,
        duration_ms: mediaAssetsTable.duration_ms,
        variant_key: mediaAssetsTable.variant_key,
        failure_reason: mediaAssetsTable.failure_reason,
      }).from(mediaAssetsTable)
        .where(and(
          eq(mediaAssetsTable.context_kind, "exchange_spark"),
          eq(mediaAssetsTable.context_id, spark.id),
          eq(mediaAssetsTable.owner_user_id, req.authenticatedUserId!),
        ));
      return {
        spark_id: spark.id,
        listing_id: spark.listing_id,
        status: spark.status,
        caption: spark.caption,
        created_at: spark.created_at.toISOString(),
        expires_at: spark.draft_expires_at.toISOString(),
        durable: true,
        media_assets: assets.map((asset) => ({
          media_asset_id: asset.id,
          media_type: asset.media_type,
          mime_type: asset.mime_type,
          byte_size: asset.byte_size,
          status: asset.status,
          duration_ms: asset.duration_ms,
          variant_ready: asset.status === "ready" && Boolean(asset.variant_key),
          error_code: asset.status === "failed" ? safeExchangeSparkFailureCode(asset.failure_reason) : null,
        })),
      };
    }));
    drafts.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return res.json({ drafts });
  },
);

router.patch(
  "/community/exchange/sparks/drafts/:sparkId",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const sparkId = positiveId(req.params.sparkId);
    if (!sparkId) return res.status(404).json({ error: "Spark draft not found." });
    const parsed = updateDraftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Spark draft data is invalid." });
    const [spark] = await db.update(exchangeSparksTable)
      .set({ caption: cleanCaption(parsed.data.caption) || null, updated_at: new Date() })
      .where(and(
        eq(exchangeSparksTable.id, sparkId),
        eq(exchangeSparksTable.author_user_id, req.authenticatedUserId!),
        eq(exchangeSparksTable.status, "draft"),
        gt(exchangeSparksTable.draft_expires_at, new Date()),
      ))
      .returning({ id: exchangeSparksTable.id, caption: exchangeSparksTable.caption });
    if (!spark) return res.status(404).json({ error: "Spark draft not found." });
    return res.json({ spark_id: spark.id, caption: spark.caption });
  },
);

router.get(
  "/community/exchange/sparks/drafts/:sparkId",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const sparkId = positiveId(req.params.sparkId);
    if (!sparkId) return res.status(404).json({ error: "Spark draft not found." });
    const userId = req.authenticatedUserId!;
    const [spark] = await db.select({
      id: exchangeSparksTable.id,
      listing_id: exchangeSparksTable.listing_id,
      status: exchangeSparksTable.status,
      caption: exchangeSparksTable.caption,
      draft_expires_at: exchangeSparksTable.draft_expires_at,
      created_at: exchangeSparksTable.created_at,
    }).from(exchangeSparksTable)
      .where(and(
        eq(exchangeSparksTable.id, sparkId),
        eq(exchangeSparksTable.author_user_id, userId),
      ))
      .limit(1);
    if (!spark || spark.status !== "draft" || spark.draft_expires_at <= new Date()) {
      return res.status(404).json({ error: "Spark draft not found." });
    }

    const assets = await db.select({
      id: mediaAssetsTable.id,
      media_type: mediaAssetsTable.media_type,
      mime_type: mediaAssetsTable.mime_type,
      byte_size: mediaAssetsTable.byte_size,
      status: mediaAssetsTable.status,
      duration_ms: mediaAssetsTable.duration_ms,
      variant_key: mediaAssetsTable.variant_key,
      failure_reason: mediaAssetsTable.failure_reason,
    }).from(mediaAssetsTable)
      .where(and(
        eq(mediaAssetsTable.context_kind, "exchange_spark"),
        eq(mediaAssetsTable.context_id, sparkId),
        eq(mediaAssetsTable.owner_user_id, userId),
      ));
    return res.json({
      spark_id: sparkId,
      listing_id: spark.listing_id,
      status: spark.status,
      caption: spark.caption,
      created_at: spark.created_at.toISOString(),
      expires_at: spark.draft_expires_at.toISOString(),
      durable: true,
      media_assets: assets.map((asset) => ({
        media_asset_id: asset.id,
        media_type: asset.media_type,
        mime_type: asset.mime_type,
        byte_size: asset.byte_size,
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

    const sparkId = positiveId(req.params.sparkId);
    if (!sparkId) return res.status(404).json({ error: "Spark draft not found." });
    const parsed = publishSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Spark publication data is invalid." });
    const userId = req.authenticatedUserId!;

    const result = await db.transaction(async (tx) => {
      const [sparkReference] = await tx.select({
        id: exchangeSparksTable.id,
        listing_id: exchangeSparksTable.listing_id,
      }).from(exchangeSparksTable)
        .where(and(
          eq(exchangeSparksTable.id, sparkId),
          eq(exchangeSparksTable.author_user_id, userId),
        ))
        .limit(1);
      if (!sparkReference) return { kind: "not-found" as const };

      const [listing] = await tx.select({
        id: exchangeListingsTable.id,
        seller_id: exchangeListingsTable.seller_id,
        community_id: usersTable.community_id,
        status: exchangeListingsTable.status,
        moderation_status: exchangeListingsTable.moderation_status,
        seller_approval_status: usersTable.approval_status,
        seller_is_suspended: usersTable.is_suspended,
      }).from(exchangeListingsTable)
        .innerJoin(usersTable, eq(usersTable.id, exchangeListingsTable.seller_id))
        .where(and(
          eq(exchangeListingsTable.id, sparkReference.listing_id),
          eq(exchangeListingsTable.seller_id, userId),
        ))
        .limit(1)
        .for("update");
      if (!listing) return { kind: "conflict" as const, error: "The linked Exchange listing is no longer eligible." };

      const [spark] = await tx.select({
        id: exchangeSparksTable.id,
        author_user_id: exchangeSparksTable.author_user_id,
        community_id: exchangeSparksTable.community_id,
        listing_id: exchangeSparksTable.listing_id,
        status: exchangeSparksTable.status,
        caption: exchangeSparksTable.caption,
        draft_expires_at: exchangeSparksTable.draft_expires_at,
      }).from(exchangeSparksTable)
        .where(and(
          eq(exchangeSparksTable.id, sparkId),
          eq(exchangeSparksTable.author_user_id, userId),
          eq(exchangeSparksTable.listing_id, sparkReference.listing_id),
        ))
        .limit(1)
        .for("update");
      if (!spark || spark.status === "deletion_pending") return { kind: "not-found" as const };
      if (spark.status === "published" || spark.status === "pending") {
        const [asset] = await tx.select({ id: mediaAssetsTable.id }).from(mediaAssetsTable)
          .where(and(
            eq(mediaAssetsTable.context_kind, "exchange_spark"),
            eq(mediaAssetsTable.context_id, sparkId),
            eq(mediaAssetsTable.owner_user_id, userId),
          ))
          .limit(1);
        return {
          kind: "published" as const,
          status: spark.status,
          mediaAssetId: asset?.id ?? null,
        };
      }
      if (spark.status !== "draft") {
        return {
          kind: "conflict" as const,
          error: spark.status === "rejected"
            ? "This Spark was rejected and cannot be published again."
            : "Spark draft cannot be published in its current state.",
        };
      }
      if (spark.status === "draft" && spark.draft_expires_at <= new Date()) {
        return { kind: "conflict" as const, error: "Spark draft has expired." };
      }

      if (code) return { kind: "unavailable" as const, code };
      if (!listing
        || listing.status !== "active"
        || listing.moderation_status !== "approved"
        || listing.seller_approval_status !== "approved"
        || listing.seller_is_suspended) {
        return { kind: "conflict" as const, error: "The linked Exchange listing is no longer eligible." };
      }

      const assets = await tx.select().from(mediaAssetsTable)
        .where(and(
          eq(mediaAssetsTable.context_kind, "exchange_spark"),
          eq(mediaAssetsTable.context_id, sparkId),
        ))
        .for("update");
      const asset = singlePublishableExchangeSparkAsset(assets, userId, sparkId);
      if (!asset) {
        return { kind: "conflict" as const, error: "Exactly one ready, validated video asset under 60 seconds is required." };
      }
      const caption = cleanCaption(parsed.data.caption ?? spark.caption) || null;
      const moderation = moderatePostText(caption ?? "");

      await tx.update(exchangeSparksTable).set({
        caption,
        community_id: listing.community_id,
        status: moderation.status === "approved" ? "published" : "pending",
        updated_at: new Date(),
      }).where(eq(exchangeSparksTable.id, sparkId));
      return {
        kind: "published" as const,
        status: moderation.status === "approved" ? "published" : "pending",
        mediaAssetId: asset.id,
      };
    });

    if (result.kind === "not-found") return res.status(404).json({ error: "Spark draft not found." });
    if (result.kind === "conflict") return res.status(409).json({ error: result.error });
    if (result.kind === "unavailable") return featureUnavailableResponse(res, result.code);
    return res.status(201).json({
      spark_id: sparkId,
      status: result.status,
      media_asset_id: result.mediaAssetId,
    });
  },
);

router.delete(
  "/community/exchange/sparks/:sparkId",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const sparkId = positiveId(req.params.sparkId);
    if (!sparkId) return res.status(404).json({ error: "Spark not found." });
    const [spark] = await db.update(exchangeSparksTable)
      .set({ status: "deletion_pending", updated_at: new Date() })
      .where(and(
        eq(exchangeSparksTable.id, sparkId),
        eq(exchangeSparksTable.author_user_id, req.authenticatedUserId!),
      ))
      .returning({ id: exchangeSparksTable.id });
    if (!spark) return res.status(404).json({ error: "Spark not found." });
    return res.status(202).json({ spark_id: sparkId, status: "deletion_pending" });
  },
);

export default router;