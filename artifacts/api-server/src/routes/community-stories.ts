import { Router } from "express";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryAuthorMutesTable,
  communityStoryElementsTable,
  communityStoryMediaTable,
  communityStoryMomentCompositionsTable,
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
import { createMessageNotification } from "../lib/message-notifications";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { isMediaPlatformV21Enabled, isMomentMusicAsset } from "../lib/media-platform";
import { enqueueMediaAssetProcessing, enqueueMomentVideoComposition, enqueuePendingMediaAssetThumbnail, regenerateMediaAssetThumbnail } from "../lib/mediaProcessingQueue";
import { mediaStorageKeys } from "../lib/media-cleanup";
import { mediaProcessingQueue } from "../lib/queue";
import { logger } from "../lib/logger";
import { buildCommunityStoryAuditEvent } from "../lib/community-story-audit";
import {
  canReadCommunityStoryAudience,
  canReadExchangeLinkedStory,
  filterStoryMentionRecipientsByVisibility,
  isLinkedStoryVideoAssetReady,
  storyVideoStreamContentType,
} from "../lib/community-story-policy";
import {
  buildStoryPlaybackSetCookie,
  issueStoryPlaybackGrant,
  readStoryPlaybackCookie,
  verifyStoryPlaybackGrant,
} from "../lib/community-story-playback";
import {
  escapeMomentSearchTerm,
  validateMomentCaptionsVtt,
  validateNewMomentVisualAltText,
} from "../lib/moment-accessibility";
import {
  MOMENT_COMPOSE_INTENT,
  isPublishedStoryMediaContext,
  momentCompositionFingerprint,
  withinMomentDurationLimit,
  validMomentComposeIds,
} from "../lib/moment-video-compose";

const router = Router();
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 6;
const MAX_MEDIA_DIMENSION = 10_000;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const STORY_AUDIENCES = ["community", "hub"] as const;
const momentCompositionRequestSchema = z.object({
  intent: z.literal(MOMENT_COMPOSE_INTENT),
  media_asset_ids: z.array(z.number().int().positive()).min(2).max(6),
}).strict();

const storyElementSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  type: z.string().trim().min(1).max(40),
  payload: z.record(z.string(), z.unknown()).default({}),
  position_x: z.number().min(0).max(100).default(50),
  position_y: z.number().min(0).max(100).default(50),
  scale: z.number().min(0.5).max(3).default(1),
  rotation: z.number().min(-180).max(180).default(0),
  z_index: z.number().int().min(0).max(100).default(0),
}).superRefine((element, context) => {
  if (element.type !== "drawing") return;
  const points = element.payload.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 1000
    || points.some((point) => !Array.isArray(point) || point.length !== 2
      || !point.every((coordinate) => typeof coordinate === "number"
        && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 100))) {
    context.addIssue({
      code: "custom",
      path: ["payload", "points"],
      message: "Drawing strokes must contain 2–1000 normalized points.",
    });
  }
  if (typeof element.payload.color !== "string" || !/^#[0-9a-f]{6}$/i.test(element.payload.color)) {
    context.addIssue({
      code: "custom",
      path: ["payload", "color"],
      message: "Drawing color must be a six-digit hex color.",
    });
  }
  if (typeof element.payload.width !== "number" || !Number.isFinite(element.payload.width)
    || element.payload.width < 1 || element.payload.width > 12) {
    context.addIssue({
      code: "custom",
      path: ["payload", "width"],
      message: "Drawing width must be between 1 and 12.",
    });
  }
});

const createStorySchema = z.object({
  client_publish_id: z.string().uuid().optional(),
  caption: z.string().trim().max(1000).optional().default(""),
  tags: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,29}$/))
    .max(10).optional().default([]),
  hub_id: z.number().int().positive().nullable().optional(),
  exchange_listing_id: z.number().int().positive().optional(),
  audience: z.enum(STORY_AUDIENCES).default("community"),
  reply_enabled: z.boolean().default(true),
  archive_enabled: z.boolean().optional().default(false),
  remix_enabled: z.boolean().optional().default(false),
  response_to_story_id: z.number().int().positive().optional(),
  challenge_key: z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/).optional(),
  media: z.array(z.object({
    data_url: z.string().min(1).max(18_000_000),
    media_type: z.enum(["photo", "video"]),
    mime_type: z.string().max(100),
    duration_ms: z.number().int().positive().max(60_000).nullable().optional(),
    width: z.number().int().positive().max(10_000).nullable().optional(),
    height: z.number().int().positive().max(10_000).nullable().optional(),
    alt_text: z.string().trim().max(250).optional(),
    captions_vtt: z.string().max(64 * 1024).optional(),
  })).min(0).max(MAX_MEDIA_ITEMS).default([]),
  media_asset_ids: z.array(z.number().int().positive()).max(MAX_MEDIA_ITEMS).optional(),
  media_accessibility: z.array(z.object({
    media_asset_id: z.number().int().positive(),
    alt_text: z.string().trim().max(250).default(""),
    captions_vtt: z.string().max(64 * 1024).optional(),
  }).strict()).max(MAX_MEDIA_ITEMS).optional().default([]),
  media_edits: z.array(z.object({
    media_asset_id: z.number().int().positive(),
    cover_time_ms: z.number().int().nonnegative(),
  })).max(MAX_MEDIA_ITEMS).optional().default([]),
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
      track_asset_id: z.number().int().positive(),
      volume: z.number().min(0).max(2).optional(),
    }).strict().nullable().optional(),
    effects: z.array(z.enum(["grayscale", "sepia", "blur"])).max(6).optional(),
  }).optional(),
});

const WEEKLY_MOMENT_CHALLENGES = [
  { key: "small-joys", prompt: "Show us a small joy from your week." },
  { key: "local-colors", prompt: "Capture a color that feels like your community." },
  { key: "everyday-creativity", prompt: "Share a moment of everyday creativity." },
  { key: "neighborly-kindness", prompt: "What is one kind thing you noticed this week?" },
] as const;

function currentWeeklyMomentChallenge(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const weekNumber = Math.floor(start.getTime() / (7 * 24 * 60 * 60 * 1000));
  const challenge = WEEKLY_MOMENT_CHALLENGES[((weekNumber % WEEKLY_MOMENT_CHALLENGES.length) + WEEKLY_MOMENT_CHALLENGES.length) % WEEKLY_MOMENT_CHALLENGES.length];
  const ends = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return {
    key: `weekly-${challenge.key}-${start.toISOString().slice(0, 10)}`,
    prompt: challenge.prompt,
    starts_at: start,
    ends_at: ends,
  };
}

export function communityStoryPublishPayloadHash(payload: {
  caption: string | null;
  audience: string;
  hubId: number | null;
  exchangeListingId: number | null;
  communityId: number | null;
  replyEnabled: boolean;
  archiveEnabled?: boolean;
  remixEnabled?: boolean;
  responseToStoryId?: number;
  challengeKey?: string;
  elements: z.infer<typeof storyElementSchema>[];
  compositionManifest: StoryCompositionManifest;
  mediaAssetIds: number[];
  tags?: string[];
  mediaAccessibility?: Array<{ media_asset_id: number; alt_text: string; captions_vtt?: string }>;
  mediaEdits?: Array<{ media_asset_id: number; cover_time_ms: number }>;
}): string {
  const canonicalBody: Record<string, unknown> = {
    caption: payload.caption,
    audience: payload.audience,
    hub_id: payload.hubId,
    exchange_listing_id: payload.exchangeListingId,
    community_id: payload.communityId,
    reply_enabled: payload.replyEnabled,
    ...(payload.archiveEnabled !== undefined ? { archive_enabled: payload.archiveEnabled } : {}),
    ...(payload.remixEnabled !== undefined ? { remix_enabled: payload.remixEnabled } : {}),
    ...(payload.responseToStoryId !== undefined ? { response_to_story_id: payload.responseToStoryId } : {}),
    ...(payload.challengeKey !== undefined ? { challenge_key: payload.challengeKey } : {}),
    elements: payload.elements,
    composition_manifest: payload.compositionManifest,
    media_asset_ids: payload.mediaAssetIds,
  };
  if (payload.tags?.length) canonicalBody.tags = payload.tags;
  if (payload.mediaAccessibility?.length) canonicalBody.media_accessibility = payload.mediaAccessibility;
  // Preserve hashes for older clients that published without per-media edits.
  if (payload.mediaEdits?.length) canonicalBody.media_edits = payload.mediaEdits;
  const canonicalPayload = JSON.stringify(canonicalBody, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
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
    music: input?.music ? {
      track_asset_id: input.music.track_asset_id,
      volume: input.music.volume ?? 0.65,
    } : null,
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
  const blocks = await db.select({
    blocker_id: directMessageBlocksTable.blocker_id,
    blocked_id: directMessageBlocksTable.blocked_id,
  })
    .from(directMessageBlocksTable)
    .where(or(
      and(eq(directMessageBlocksTable.blocker_id, userId), eq(directMessageBlocksTable.blocked_id, story.author_user_id)),
      and(eq(directMessageBlocksTable.blocker_id, story.author_user_id), eq(directMessageBlocksTable.blocked_id, userId)),
    )).limit(1);
  if (blocks.length) return false;
  const [mute] = await db.select({ viewer_user_id: communityStoryAuthorMutesTable.viewer_user_id })
    .from(communityStoryAuthorMutesTable)
    .where(and(
      eq(communityStoryAuthorMutesTable.viewer_user_id, userId),
      eq(communityStoryAuthorMutesTable.muted_user_id, story.author_user_id),
    ))
    .limit(1);
  if (mute) return false;

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

async function viewerCanReadRetainedStory(userId: number, story: {
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  audience: string;
  exchange_listing_id?: number | null;
  expires_at: Date;
  archive_enabled: boolean;
  featured_at: Date | null;
}): Promise<boolean> {
  if (story.expires_at > new Date()) return viewerCanReadStory(userId, story);
  if (story.author_user_id === userId && story.archive_enabled) return true;
  return story.featured_at !== null && story.audience === "community"
    && await viewerCanReadStory(userId, story);
}

function publicStory(row: {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  caption: string | null;
  tags: string[];
  audience: string;
  reply_enabled: boolean;
  created_at: Date;
  expires_at: Date;
  archive_enabled: boolean;
  remix_enabled: boolean;
  featured_at: Date | null;
  response_to_story_id: number | null;
  response_to_author_user_id: number | null;
  response_author_name?: string | null;
  challenge_key: string | null;
  author_name: string;
  avatar_url: string | null;
  composition_manifest: typeof communityStoriesTable.$inferSelect["composition_manifest"];
  exchange_listing_id: number | null;
}, media: Array<typeof communityStoryMediaTable.$inferSelect>, elements: Array<typeof communityStoryElementsTable.$inferSelect>, momentVideo?: {
  status: string;
  duration_ms: number | null;
  playback_grant_url: string;
} | null, viewerUserId?: number) {
  return {
    id: row.id,
    author_user_id: row.author_user_id,
    hub_id: row.hub_id,
    exchange_listing_id: row.exchange_listing_id,
    community_id: row.community_id,
    caption: row.caption,
    tags: row.tags,
    audience: row.audience,
    reply_enabled: row.reply_enabled,
    featured_at: row.featured_at ? serializeDate(row.featured_at) : null,
    remix_enabled: row.remix_enabled,
    response_to_story_id: row.response_to_story_id,
    response_to: row.response_to_story_id === null && row.response_to_author_user_id === null && !row.response_author_name ? null : {
      story_id: row.response_to_story_id,
      author_user_id: row.response_to_author_user_id,
      author_name: row.response_author_name ?? null,
    },
    challenge_key: row.challenge_key,
    ...(viewerUserId === row.author_user_id ? { archive_enabled: row.archive_enabled } : {}),
    created_at: serializeDate(row.created_at),
    expires_at: serializeDate(row.expires_at),
    composition_manifest: row.composition_manifest
      ? { ...row.composition_manifest, music: null }
      : null,
    moment_video: momentVideo ?? null,
    author: { id: row.author_user_id, name: row.author_name, avatar_url: row.avatar_url },
    media: media.filter((item) => item.media_asset_id !== row.composition_manifest?.music?.track_asset_id).map((item) => ({
      id: item.id,
      media_type: item.media_type,
      mime_type: item.mime_type,
      duration_ms: item.duration_ms,
      width: item.width,
      height: item.height,
      alt_text: item.alt_text,
      captions_vtt: item.captions_vtt,
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
    archive_enabled: communityStoriesTable.archive_enabled,
    featured_at: communityStoriesTable.featured_at,
  }).from(communityStoryMediaTable)
    .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(eq(communityStoryMediaTable.id, mediaId))
    .limit(1);
  if (!row || row.media_type !== "video" || !row.mime_type.startsWith("video/")
    || row.status !== "published"
    || !(await viewerCanReadRetainedStory(userId, row))) return null;
  if (!isLinkedStoryVideoAssetReady({
    linked: row.exchange_listing_id !== null,
    mediaType: row.media_type,
    mediaAssetId: row.media_asset_id,
    assetStatus: row.asset_status,
    variantKey: row.variant_key,
  })) return null;
  return row;
}

async function momentCompositionForStory(storyId: number) {
  const [row] = await db.select({
    story_id: communityStoryMomentCompositionsTable.story_id,
    source_media_asset_ids: communityStoryMomentCompositionsTable.source_media_asset_ids,
    status: communityStoryMomentCompositionsTable.status,
    failure_code: communityStoryMomentCompositionsTable.failure_code,
    derived_media_asset_id: communityStoryMomentCompositionsTable.derived_media_asset_id,
    asset_status: mediaAssetsTable.status,
    variant_key: mediaAssetsTable.variant_key,
    mime_type: mediaAssetsTable.mime_type,
    duration_ms: mediaAssetsTable.duration_ms,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    audience: communityStoriesTable.audience,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    story_status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
  }).from(communityStoryMomentCompositionsTable)
    .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMomentCompositionsTable.story_id))
    .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMomentCompositionsTable.derived_media_asset_id))
    .where(eq(communityStoryMomentCompositionsTable.story_id, storyId))
    .limit(1);
  return row ?? null;
}

router.get("/community/stories/muted-authors", requireAuth, requireApproved, async (req, res) => {
  const mutedAuthors = await db.select({
    user_id: communityStoryAuthorMutesTable.muted_user_id,
    name: usersTable.name,
    avatar_url: usersTable.avatar_url,
    created_at: communityStoryAuthorMutesTable.created_at,
  })
    .from(communityStoryAuthorMutesTable)
    .innerJoin(usersTable, eq(usersTable.id, communityStoryAuthorMutesTable.muted_user_id))
    .where(eq(communityStoryAuthorMutesTable.viewer_user_id, req.authenticatedUserId!))
    .orderBy(desc(communityStoryAuthorMutesTable.created_at))
    .limit(200);
  return res.json({ muted_authors: mutedAuthors });
});

router.put("/community/stories/authors/:id/mute", requireAuth, requireApproved, async (req, res) => {
  const viewerId = req.authenticatedUserId!;
  const mutedUserId = positiveId(req.params.id);
  if (!mutedUserId || mutedUserId === viewerId) return res.status(400).json({ error: "Choose another approved author to mute." });
  const [author] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.id, mutedUserId),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
    ))
    .limit(1);
  if (!author) return res.status(404).json({ error: "Author not found." });
  await db.insert(communityStoryAuthorMutesTable).values({
    viewer_user_id: viewerId,
    muted_user_id: mutedUserId,
  }).onConflictDoNothing();
  return res.json({ muted: true });
});

router.delete("/community/stories/authors/:id/mute", requireAuth, requireApproved, async (req, res) => {
  const viewerId = req.authenticatedUserId!;
  const mutedUserId = positiveId(req.params.id);
  if (!mutedUserId) return res.status(400).json({ error: "Invalid author id." });
  await db.delete(communityStoryAuthorMutesTable).where(and(
    eq(communityStoryAuthorMutesTable.viewer_user_id, viewerId),
    eq(communityStoryAuthorMutesTable.muted_user_id, mutedUserId),
  ));
  return res.json({ muted: false });
});

router.get("/community/stories/challenge", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const hubId = req.query.hubId === undefined ? null : positiveId(req.query.hubId);
  if (req.query.hubId !== undefined && !hubId) return res.status(400).json({ error: "hubId must be a positive integer." });
  if (hubId && !(await approvedCanonicalHub(hubId))) return res.status(404).json({ error: "Canonical Hub not found." });
  if (hubId && !(await approvedHubMember(userId, hubId))) return res.status(403).json({ error: "Approved Hub membership is required to view this Hub's challenge." });
  const [viewer] = await db.select({ community_id: usersTable.community_id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const challenge = currentWeeklyMomentChallenge();
  const [count] = await db.select({ participant_count: sql<number>`count(DISTINCT ${communityStoriesTable.author_user_id})::int` })
    .from(communityStoriesTable)
    .innerJoin(usersTable, eq(usersTable.id, communityStoriesTable.author_user_id))
    .where(and(
      eq(communityStoriesTable.challenge_key, challenge.key),
      eq(communityStoriesTable.status, "published"),
      sql`${communityStoriesTable.expires_at} > now()`,
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      hubId ? and(eq(communityStoriesTable.audience, "hub"), eq(communityStoriesTable.hub_id, hubId))
        : and(eq(communityStoriesTable.audience, "community"), viewer?.community_id == null
          ? isNull(communityStoriesTable.community_id)
          : eq(communityStoriesTable.community_id, viewer.community_id)),
      sql`NOT EXISTS (
        SELECT 1 FROM direct_message_blocks b
        WHERE (b.blocker_id = ${userId} AND b.blocked_id = ${communityStoriesTable.author_user_id})
           OR (b.blocker_id = ${communityStoriesTable.author_user_id} AND b.blocked_id = ${userId})
      )`,
      sql`NOT EXISTS (
        SELECT 1 FROM community_story_author_mutes m
        WHERE m.viewer_user_id = ${userId} AND m.muted_user_id = ${communityStoriesTable.author_user_id}
      )`,
    ));
  return res.json({
    challenge: {
      key: challenge.key,
      prompt: challenge.prompt,
      starts_at: challenge.starts_at.toISOString(),
      ends_at: challenge.ends_at.toISOString(),
      participant_count: count?.participant_count ?? 0,
    },
  });
});

router.get("/community/stories/creator/:authorId", requireAuth, requireApproved, async (req, res) => {
  const authorId = positiveId(req.params.authorId);
  if (!authorId) return res.status(400).json({ error: "authorId must be a positive integer." });
  const view = req.query.view === undefined ? "published" : String(req.query.view);
  if (!["published", "archive", "featured"].includes(view)) return res.status(400).json({ error: "view must be published, archive, or featured." });
  const userId = req.authenticatedUserId!;
  const [viewer] = await db.select({ community_id: usersTable.community_id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const [creator] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    avatar_url: usersTable.avatar_url,
    community_id: usersTable.community_id,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
  }).from(usersTable).where(eq(usersTable.id, authorId)).limit(1);
  if (!creator || creator.approval_status !== "approved" || creator.is_suspended) return res.status(404).json({ error: "Creator not found." });
  const isOwner = userId === authorId;
  if (view === "archive" && !isOwner) return res.status(404).json({ error: "Creator archive not found." });
  if (view === "featured" && !isOwner && (creator.community_id == null || creator.community_id !== viewer?.community_id)) {
    return res.status(404).json({ error: "Creator not found." });
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
  const now = new Date();
  const condition = view === "archive"
    ? and(eq(communityStoriesTable.archive_enabled, true), eq(communityStoriesTable.author_user_id, authorId))
    : view === "featured"
      ? and(isNotNull(communityStoriesTable.featured_at), eq(communityStoriesTable.author_user_id, authorId))
      : and(
        eq(communityStoriesTable.author_user_id, authorId),
        eq(communityStoriesTable.status, "published"),
        sql`${communityStoriesTable.expires_at} > ${now}`,
      );
  const rows = await db.select({
    id: communityStoriesTable.id,
    author_user_id: communityStoriesTable.author_user_id,
    tags: communityStoriesTable.tags,
    hub_id: communityStoriesTable.hub_id,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    community_id: communityStoriesTable.community_id,
    caption: communityStoriesTable.caption,
    audience: communityStoriesTable.audience,
    reply_enabled: communityStoriesTable.reply_enabled,
    archive_enabled: communityStoriesTable.archive_enabled,
    remix_enabled: communityStoriesTable.remix_enabled,
    featured_at: communityStoriesTable.featured_at,
    response_to_story_id: communityStoriesTable.response_to_story_id,
    response_to_author_user_id: communityStoriesTable.response_to_author_user_id,
    response_author_name: communityStoriesTable.response_to_author_name,
    challenge_key: communityStoriesTable.challenge_key,
    created_at: communityStoriesTable.created_at,
    expires_at: communityStoriesTable.expires_at,
    composition_manifest: communityStoriesTable.composition_manifest,
    author_name: usersTable.name,
    avatar_url: usersTable.avatar_url,
  }).from(communityStoriesTable).innerJoin(usersTable, eq(usersTable.id, communityStoriesTable.author_user_id))
    .where(and(
      condition,
      eq(communityStoriesTable.status, "published"),
      view === "archive" ? undefined : eq(communityStoriesTable.audience, "community"),
      view === "archive" || isOwner ? undefined : eq(communityStoriesTable.community_id, viewer?.community_id ?? -1),
      sql`NOT EXISTS (
        SELECT 1 FROM direct_message_blocks b
        WHERE (b.blocker_id = ${userId} AND b.blocked_id = ${authorId})
           OR (b.blocker_id = ${authorId} AND b.blocked_id = ${userId})
      )`,
      view === "archive" || isOwner ? undefined : sql`NOT EXISTS (
        SELECT 1 FROM community_story_author_mutes m
        WHERE m.viewer_user_id = ${userId} AND m.muted_user_id = ${authorId}
      )`,
      cursor ? or(
        lt(communityStoriesTable.created_at, cursor.createdAt),
        and(
          eq(communityStoriesTable.created_at, cursor.createdAt),
          lt(communityStoriesTable.id, cursor.id),
        ),
      ) : undefined,
    ))
    .orderBy(desc(communityStoriesTable.created_at), desc(communityStoriesTable.id))
    .limit(51);
  const hasMore = rows.length > 50;
  const page = rows.slice(0, 50);
  const ids = page.map((row) => row.id);
  const [media, elements] = ids.length ? await Promise.all([
    db.select().from(communityStoryMediaTable).where(inArray(communityStoryMediaTable.story_id, ids)).orderBy(asc(communityStoryMediaTable.id)),
    db.select().from(communityStoryElementsTable).where(inArray(communityStoryElementsTable.story_id, ids)).orderBy(communityStoryElementsTable.z_index),
  ]) : [[], []];
  const result = page.map((row) => publicStory(
    row,
    media.filter((item) => item.story_id === row.id),
    elements.filter((item) => item.story_id === row.id),
    null,
    userId,
  ));
  return res.json({
    stories: result,
    creator: { id: creator.id, name: creator.name, avatar_url: creator.avatar_url },
    viewer_user_id: userId,
    next_cursor: hasMore ? Buffer.from(JSON.stringify({
      created_at: page[page.length - 1].created_at.toISOString(),
      id: page[page.length - 1].id,
    })).toString("base64url") : null,
  });
});

router.post("/community/stories/:id/archive", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  const [story] = await db.update(communityStoriesTable).set({ archive_enabled: true })
    .where(and(
      eq(communityStoriesTable.id, storyId),
      eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
      eq(communityStoriesTable.status, "published"),
    )).returning({ id: communityStoriesTable.id });
  if (!story) return res.status(404).json({ error: "Moment not found." });
  return res.json({ ok: true });
});

router.post("/community/stories/:id/featured", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  const [viewer] = await db.select({ community_id: usersTable.community_id })
    .from(usersTable).where(eq(usersTable.id, req.authenticatedUserId!)).limit(1);
  if (viewer?.community_id == null) return res.status(404).json({ error: "Only a Moment in your current Community can be featured." });
  const [story] = await db.update(communityStoriesTable).set({
    featured_at: new Date(),
    archive_enabled: true,
  }).where(and(
    eq(communityStoriesTable.id, storyId),
    eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
    eq(communityStoriesTable.status, "published"),
    or(
      sql`${communityStoriesTable.expires_at} > now()`,
      eq(communityStoriesTable.archive_enabled, true),
    ),
    eq(communityStoriesTable.audience, "community"),
    eq(communityStoriesTable.community_id, viewer.community_id),
    isNull(communityStoriesTable.exchange_listing_id),
  )).returning({ id: communityStoriesTable.id });
  if (!story) return res.status(404).json({ error: "Only a published or archived Moment in your current Community can be featured." });
  return res.json({ ok: true });
});

router.delete("/community/stories/:id/featured", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  await db.update(communityStoriesTable).set({ featured_at: null })
    .where(and(
      eq(communityStoriesTable.id, storyId),
      eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
    ));
  return res.json({ ok: true });
});

router.patch("/community/stories/:id/settings", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  const body = z.object({ remix_enabled: z.boolean() }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Settings must contain only a boolean remix_enabled value." });
  const [story] = await db.update(communityStoriesTable).set({ remix_enabled: body.data.remix_enabled })
    .where(and(
      eq(communityStoriesTable.id, storyId),
      eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
      eq(communityStoriesTable.status, "published"),
    )).returning({ id: communityStoriesTable.id });
  if (!story) return res.status(404).json({ error: "Moment not found." });
  return res.json({ ok: true, remix_enabled: body.data.remix_enabled });
});

router.get("/community/stories", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const requestedHubId = req.query.hubId ? positiveId(req.query.hubId) : null;
  if (req.query.hubId && !requestedHubId) return res.status(400).json({ error: "hubId must be a positive integer." });
  if (requestedHubId && !(await approvedCanonicalHub(requestedHubId))) return res.status(404).json({ error: "Canonical Hub not found." });
  if (requestedHubId && !(await approvedHubMember(userId, requestedHubId))) return res.status(403).json({ error: "Approved Hub membership is required to view this Hub's Stories." });
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (req.query.search !== undefined && (typeof req.query.search !== "string" || search.length > 100 || /[\u0000-\u001f\u007f]/.test(search))) {
    return res.status(400).json({ error: "search must be at most 100 printable characters." });
  }
  const rawTag = typeof req.query.tag === "string" ? req.query.tag.trim().replace(/^#/, "").toLowerCase() : "";
  if (req.query.tag !== undefined && !/^[a-z0-9][a-z0-9-]{0,29}$/.test(rawTag)) {
    return res.status(400).json({ error: "tag must contain 1–30 letters, numbers, or hyphens." });
  }
  const requestedAuthorId = req.query.authorId === undefined ? null : positiveId(req.query.authorId);
  if (req.query.authorId !== undefined && !requestedAuthorId) return res.status(400).json({ error: "authorId must be a positive integer." });
  const searchPattern = search ? `%${escapeMomentSearchTerm(search)}%` : null;
  const hasDiscoveryFilter = Boolean(searchPattern || rawTag || requestedAuthorId);
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
    tags: communityStoriesTable.tags,
    hub_id: communityStoriesTable.hub_id,
    exchange_listing_id: communityStoriesTable.exchange_listing_id,
    community_id: communityStoriesTable.community_id,
    caption: communityStoriesTable.caption,
    audience: communityStoriesTable.audience,
    reply_enabled: communityStoriesTable.reply_enabled,
    archive_enabled: communityStoriesTable.archive_enabled,
    remix_enabled: communityStoriesTable.remix_enabled,
    featured_at: communityStoriesTable.featured_at,
    response_to_story_id: communityStoriesTable.response_to_story_id,
    response_to_author_user_id: communityStoriesTable.response_to_author_user_id,
    response_author_name: communityStoriesTable.response_to_author_name,
    challenge_key: communityStoriesTable.challenge_key,
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
      sql`NOT EXISTS (
        SELECT 1
        FROM direct_message_blocks story_block
        WHERE (story_block.blocker_id = ${userId} AND story_block.blocked_id = ${communityStoriesTable.author_user_id})
           OR (story_block.blocker_id = ${communityStoriesTable.author_user_id} AND story_block.blocked_id = ${userId})
      )`,
      sql`NOT EXISTS (
        SELECT 1
        FROM community_story_author_mutes story_mute
        WHERE story_mute.viewer_user_id = ${userId}
          AND story_mute.muted_user_id = ${communityStoriesTable.author_user_id}
      )`,
      visibility,
      hasDiscoveryFilter ? isNull(communityStoriesTable.exchange_listing_id) : undefined,
      requestedAuthorId === null ? undefined : eq(communityStoriesTable.author_user_id, requestedAuthorId),
      rawTag ? sql`${communityStoriesTable.tags} @> ARRAY[${rawTag}]::text[]` : undefined,
      searchPattern
        ? sql`coalesce(${communityStoriesTable.caption}, '') ILIKE ${searchPattern} ESCAPE E'\\\\'`
        : undefined,
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
  const [mediaRows, elements, momentCompositionRows] = ids.length ? await Promise.all([
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
    db.select({
      story_id: communityStoryMomentCompositionsTable.story_id,
      status: communityStoryMomentCompositionsTable.status,
      asset_status: mediaAssetsTable.status,
      variant_key: mediaAssetsTable.variant_key,
      duration_ms: mediaAssetsTable.duration_ms,
    }).from(communityStoryMomentCompositionsTable)
      .innerJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMomentCompositionsTable.derived_media_asset_id))
      .where(inArray(communityStoryMomentCompositionsTable.story_id, ids)),
  ]) : [[], [], []];
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
  const momentVideoByStory = new Map<number, {
    status: string;
    duration_ms: number | null;
    playback_grant_url: string;
  }>();
  momentCompositionRows.forEach((item) => {
    const ready = item.status === "ready" && item.asset_status === "ready" && Boolean(item.variant_key);
    momentVideoByStory.set(item.story_id, {
      status: ready ? "ready" : item.status,
      duration_ms: ready ? item.duration_ms : null,
      playback_grant_url: `/api/community/stories/${item.story_id}/moment-composition/playback-grant`,
    });
  });
  return res.json({
    stories: rows.map((row) => publicStory(
      row,
      mediaByStory.get(row.id) ?? [],
      elementsByStory.get(row.id) ?? [],
      isMediaPlatformV21Enabled() ? momentVideoByStory.get(row.id) ?? null : null,
      userId,
    )),
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

router.post("/community/stories/:id/moment-composition", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return res.status(404).json({ error: "Moment video composition is unavailable." });
  const storyId = positiveId(req.params.id);
  const parsed = momentCompositionRequestSchema.safeParse(req.body);
  if (!storyId || !parsed.success || !validMomentComposeIds(parsed.data.media_asset_ids)) {
    return res.status(400).json({
      error: "Provide intent camera_clip_reel and an ordered list of two to six unique video media asset ids.",
    });
  }
  const sourceIds = parsed.data.media_asset_ids;
  const fingerprint = momentCompositionFingerprint(sourceIds);

  let result: { mediaAssetId: number; status: string } | { error: "not_found" | "invalid" | "conflict" } = { error: "not_found" };
  try {
    result = await db.transaction(async (tx) => {
      const [story] = await tx.select({
        id: communityStoriesTable.id,
        author_user_id: communityStoriesTable.author_user_id,
        hub_id: communityStoriesTable.hub_id,
        audience: communityStoriesTable.audience,
        exchange_listing_id: communityStoriesTable.exchange_listing_id,
        status: communityStoriesTable.status,
        expires_at: communityStoriesTable.expires_at,
      }).from(communityStoriesTable)
        .where(eq(communityStoriesTable.id, storyId))
        .limit(1)
        .for("update");
      if (!story || story.author_user_id !== req.authenticatedUserId
        || story.status !== "published" || story.expires_at <= new Date()) return { error: "not_found" } as const;
      if (story.exchange_listing_id !== null) return { error: "invalid" } as const;
      if (story.audience === "hub" && !story.hub_id) return { error: "invalid" } as const;
      const assets = await tx.select({
        id: mediaAssetsTable.id,
        owner_user_id: mediaAssetsTable.owner_user_id,
        context_kind: mediaAssetsTable.context_kind,
        context_id: mediaAssetsTable.context_id,
        media_type: mediaAssetsTable.media_type,
        mime_type: mediaAssetsTable.mime_type,
        duration_ms: mediaAssetsTable.duration_ms,
        status: mediaAssetsTable.status,
      }).from(mediaAssetsTable)
        .where(inArray(mediaAssetsTable.id, sourceIds))
        .for("share");
      const attachments = await tx.select({ media_asset_id: communityStoryMediaTable.media_asset_id })
        .from(communityStoryMediaTable)
        .where(and(
          eq(communityStoryMediaTable.story_id, storyId),
          inArray(communityStoryMediaTable.media_asset_id, sourceIds),
        ));
      if (assets.length !== sourceIds.length || attachments.length !== sourceIds.length
        || assets.some((asset) => asset.owner_user_id !== req.authenticatedUserId
          || !isPublishedStoryMediaContext(asset.context_kind, asset.context_id, story.id)
          || asset.media_type !== "video" || !asset.mime_type.startsWith("video/")
          || asset.status !== "ready" || !Number.isSafeInteger(asset.duration_ms) || asset.duration_ms! < 1)
        || !withinMomentDurationLimit(sourceIds.map((id) => assets.find((asset) => asset.id === id)?.duration_ms ?? 0))) {
        return { error: "invalid" } as const;
      }

      const [existing] = await tx.select({
        derived_media_asset_id: communityStoryMomentCompositionsTable.derived_media_asset_id,
        source_fingerprint: communityStoryMomentCompositionsTable.source_fingerprint,
        status: communityStoryMomentCompositionsTable.status,
      }).from(communityStoryMomentCompositionsTable)
        .where(eq(communityStoryMomentCompositionsTable.story_id, storyId))
        .limit(1)
        .for("update");
      if (existing) {
        if (existing.source_fingerprint !== fingerprint) return { error: "conflict" } as const;
        if (existing.status === "failed") {
          const retriedAt = new Date();
          await tx.update(communityStoryMomentCompositionsTable).set({
            status: "queued", failure_code: null, updated_at: retriedAt,
          }).where(eq(communityStoryMomentCompositionsTable.story_id, storyId));
          await tx.update(mediaAssetsTable).set({
            status: "processing", failure_reason: null, variant_key: null, updated_at: retriedAt,
          }).where(eq(mediaAssetsTable.id, existing.derived_media_asset_id));
          await tx.update(mediaProcessingJobsTable).set({
            status: "queued", error: null, started_at: null, completed_at: null, updated_at: retriedAt,
          }).where(and(
            eq(mediaProcessingJobsTable.media_asset_id, existing.derived_media_asset_id),
            eq(mediaProcessingJobsTable.job_type, "moment_compose"),
          ));
        }
        return { mediaAssetId: existing.derived_media_asset_id, status: existing.status === "failed" ? "queued" : existing.status } as const;
      }

      const [derivedAsset] = await tx.insert(mediaAssetsTable).values({
        owner_user_id: story.author_user_id,
        context_kind: "story",
        context_id: story.id,
        media_type: "video",
        mime_type: "video/mp4",
        original_key: `media-assets/moment-compositions/${randomUUID()}.mp4`,
        byte_size: 1,
        status: "processing",
        metadata: { derived_kind: "moment_camera_clip_reel", source_fingerprint: fingerprint },
      }).returning({ id: mediaAssetsTable.id });
      await tx.insert(communityStoryMomentCompositionsTable).values({
        story_id: storyId,
        derived_media_asset_id: derivedAsset.id,
        source_media_asset_ids: sourceIds,
        source_fingerprint: fingerprint,
        status: "queued",
      });
      await tx.insert(mediaProcessingJobsTable).values({
        media_asset_id: derivedAsset.id,
        job_type: "moment_compose",
        status: "queued",
      });
      return { mediaAssetId: derivedAsset.id, status: "queued" } as const;
    });
  } catch (error) {
    logger.error({ err: error, storyId }, "moment-composition: request could not be persisted");
    return res.status(503).json({ error: "Moment video composition could not be queued. Retry the same request safely." });
  }
  if ("error" in result) {
    if (result.error === "conflict") {
      return res.status(409).json({ error: "This Story already has a camera-clip reel with a different ordered source list." });
    }
    if (result.error === "invalid") {
      return res.status(400).json({
        error: "Camera-clip reels require two to six attached, ready videos owned by you in this Moment, with no more than 60 seconds total.",
      });
    }
    return res.status(404).json({ error: "Story not found." });
  }
  try {
    await enqueueMomentVideoComposition(result.mediaAssetId);
  } catch (error) {
    logger.warn({ err: error, storyId, mediaAssetId: result.mediaAssetId }, "moment-composition: durable request awaits queue recovery");
    return res.status(503).json({ error: "The composition was saved but is waiting for the processing queue. Retry this request safely." });
  }
  const composition = await momentCompositionForStory(storyId);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(202).json({
    composition: {
      status: composition?.status ?? result.status,
      playback_grant_url: `/api/community/stories/${storyId}/moment-composition/playback-grant`,
      status_url: `/api/community/stories/${storyId}/moment-composition`,
    },
  });
});

router.get("/community/stories/:id/moment-composition", requireAuth, requireApproved, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return res.status(404).json({ error: "Moment video composition is unavailable." });
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(404).json({ error: "Moment composition not found." });
  const composition = await momentCompositionForStory(storyId);
  if (!composition || composition.story_status !== "published" || composition.expires_at <= new Date()
    || !(await viewerCanReadStory(req.authenticatedUserId!, composition))) {
    return res.status(404).json({ error: "Moment composition not found." });
  }
  const ready = composition.status === "ready" && composition.asset_status === "ready" && Boolean(composition.variant_key);
  res.setHeader("Cache-Control", "private, no-store");
  return res.json({
    composition: {
      status: ready ? "ready" : composition.status,
      failure_code: composition.status === "failed" ? composition.failure_code : null,
      duration_ms: ready ? composition.duration_ms : null,
      playback_grant_url: `/api/community/stories/${storyId}/moment-composition/playback-grant`,
      source_count: Array.isArray(composition.source_media_asset_ids) ? composition.source_media_asset_ids.length : 0,
    },
  });
});

router.post("/community/stories", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const parsed = createStorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Story data is invalid. Add a photo, video, or caption and try again." });
  const userId = req.authenticatedUserId!;
  const hubId = parsed.data.hub_id ?? null;
  const exchangeListingId = parsed.data.exchange_listing_id ?? null;
  const mediaAssetIds = parsed.data.media_asset_ids ?? [];
  if (parsed.data.response_to_story_id !== undefined
    && (parsed.data.media.length > 0 || mediaAssetIds.length === 0)) {
    return res.status(400).json({ error: "A video response must use one or more uploaded video assets." });
  }
  const mediaAccessibility = parsed.data.media_accessibility;
  const accessibilityByAssetId = new Map(mediaAccessibility.map((item) => [item.media_asset_id, item]));
  const mediaEdits = parsed.data.media_edits;
  const [viewer] = await db.select({ community_id: usersTable.community_id })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const challenge = currentWeeklyMomentChallenge();
  let responseSource: { author_user_id: number; author_name: string } | null = null;
  if (parsed.data.challenge_key && parsed.data.challenge_key !== challenge.key) {
    return res.status(400).json({ error: "challenge_key must identify the current weekly Moment challenge." });
  }
  if (parsed.data.response_to_story_id !== undefined) {
    const [source] = await db.select({
      id: communityStoriesTable.id,
      author_user_id: communityStoriesTable.author_user_id,
      hub_id: communityStoriesTable.hub_id,
      community_id: communityStoriesTable.community_id,
      audience: communityStoriesTable.audience,
      exchange_listing_id: communityStoriesTable.exchange_listing_id,
      remix_enabled: communityStoriesTable.remix_enabled,
      author_approval_status: usersTable.approval_status,
      author_is_suspended: usersTable.is_suspended,
      author_name: usersTable.name,
    }).from(communityStoriesTable)
      .innerJoin(usersTable, eq(usersTable.id, communityStoriesTable.author_user_id))
      .where(and(
        eq(communityStoriesTable.id, parsed.data.response_to_story_id),
        eq(communityStoriesTable.status, "published"),
        sql`${communityStoriesTable.expires_at} > now()`,
      )).limit(1);
    if (parsed.data.audience !== "community" || exchangeListingId !== null
      || !source || source.author_user_id === userId || !source.remix_enabled
      || source.audience !== "community" || source.exchange_listing_id !== null
      || source.community_id === null || source.community_id !== viewer?.community_id
      || source.author_approval_status !== "approved" || source.author_is_suspended
      || !(await viewerCanReadStory(userId, source))) {
      return res.status(404).json({ error: "Response source Moment is not available for remixing." });
    }
    responseSource = { author_user_id: source.author_user_id, author_name: source.author_name };
    const [sourceVideo] = await db.select({ id: communityStoryMediaTable.id })
      .from(communityStoryMediaTable)
      .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
      .where(and(
        eq(communityStoryMediaTable.story_id, source.id),
        eq(communityStoryMediaTable.media_type, "video"),
        or(
          isNull(communityStoryMediaTable.media_asset_id),
          and(eq(mediaAssetsTable.status, "ready"), sql`${mediaAssetsTable.variant_key} IS NOT NULL`),
        ),
      )).limit(1);
    if (!sourceVideo) return res.status(404).json({ error: "Response source Moment has no ready video." });
  }
  if (parsed.data.response_to_story_id !== undefined && mediaAssetIds.length) {
    const [readyResponseVideo] = await db.select({ id: mediaAssetsTable.id })
      .from(mediaAssetsTable)
      .where(and(
        inArray(mediaAssetsTable.id, mediaAssetIds),
        eq(mediaAssetsTable.owner_user_id, userId),
        eq(mediaAssetsTable.media_type, "video"),
        eq(mediaAssetsTable.status, "ready"),
        sql`${mediaAssetsTable.variant_key} IS NOT NULL`,
      )).limit(1);
    if (!readyResponseVideo) return res.status(400).json({ error: "A response Moment must include a ready video." });
  } else if (parsed.data.response_to_story_id !== undefined) {
    return res.status(400).json({ error: "A response Moment must include a ready uploaded video asset." });
  }
  const caption = cleanText(parsed.data.caption, 1000) || null;
  const tags = parsed.data.tags;
  if (new Set(tags).size !== tags.length) return res.status(400).json({ error: "Moment tags must be unique." });
  if (new Set(mediaAccessibility.map((item) => item.media_asset_id)).size !== mediaAccessibility.length) {
    return res.status(400).json({ error: "Each Moment attachment can have only one accessibility description." });
  }
  if (mediaAccessibility.some((item) => !mediaAssetIds.includes(item.media_asset_id))) {
    return res.status(400).json({ error: "Accessibility descriptions must target attached media assets." });
  }
  for (const item of [...mediaAccessibility, ...parsed.data.media]) {
    if (item.captions_vtt) {
      const captionError = validateMomentCaptionsVtt(item.captions_vtt);
      if (captionError) return res.status(400).json({ error: captionError });
    }
  }
  const compositionManifest = normalizeCompositionManifest(parsed.data.composition_manifest, parsed.data.elements);
  const publishPayloadHash = parsed.data.client_publish_id
    ? communityStoryPublishPayloadHash({
      caption,
      audience: parsed.data.audience,
      hubId,
      exchangeListingId,
      communityId: viewer?.community_id ?? null,
      replyEnabled: parsed.data.reply_enabled,
      archiveEnabled: parsed.data.archive_enabled ? true : undefined,
      remixEnabled: parsed.data.remix_enabled ? true : undefined,
      responseToStoryId: parsed.data.response_to_story_id,
      challengeKey: parsed.data.challenge_key,
      elements: parsed.data.elements,
      compositionManifest,
      mediaAssetIds,
      tags,
      mediaAccessibility,
      mediaEdits,
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
      if (mediaEdits.length) {
        try {
          await Promise.all(mediaEdits.map((edit) => enqueuePendingMediaAssetThumbnail(edit.media_asset_id)));
        } catch (error) {
          logger.error({ err: error, storyId: existing.id }, "media-processing: pending cover thumbnail could not be republished");
          return res.status(503).json({
            error: "Story saved, but cover thumbnail processing is temporarily unavailable. Please refresh shortly.",
            error_code: "MEDIA_PROCESSING_UNAVAILABLE",
          });
        }
      }
      logger.info(buildCommunityStoryAuditEvent({
        action: "publish_replayed",
        actorUserId: userId,
        storyId: existing.id,
        storyStatus: existing.status,
      }), "community-story audit event");
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
  if (new Set(mediaEdits.map((edit) => edit.media_asset_id)).size !== mediaEdits.length) {
    return res.status(400).json({ error: "Media edits must contain unique asset ids." });
  }
  if (mediaEdits.some((edit) => !mediaAssetIds.includes(edit.media_asset_id))) {
    return res.status(400).json({ error: "Every media edit must target an attached media asset." });
  }
  if (mediaEdits.length && parsed.data.media.length) {
    return res.status(400).json({ error: "Media edits require uploaded media assets." });
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
      logger.info(buildCommunityStoryAuditEvent({
        action: "publish_replayed",
        actorUserId: userId,
        storyId: first.story_id,
        storyStatus: first.status,
      }), "community-story audit event");
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
  if (exchangeListingId === null) {
    const altTextError = validateNewMomentVisualAltText(parsed.data.media, false);
    if (altTextError) return res.status(400).json({ error: altTextError });
  }
  if (!parsed.data.caption && parsed.data.media.length === 0 && mediaAssetIds.length === 0 && parsed.data.elements.length === 0) {
    return res.status(400).json({ error: "A Story needs media, text, or a creative element." });
  }
  if (compositionManifest.music?.track_asset_id
    && !mediaAssetIds.includes(compositionManifest.music.track_asset_id)) {
    return res.status(400).json({ error: "The background music track must be uploaded as part of this Moment." });
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
      metadata: mediaAssetsTable.metadata,
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
    if (parsed.data.response_to_story_id !== undefined
      && stagedAssets.some((asset) => asset.media_type !== "video")) {
      return res.status(400).json({ error: "A video response may contain only video attachments." });
    }
    if (exchangeListingId === null) {
      const altTextError = validateNewMomentVisualAltText(stagedAssets
        .filter((asset) => asset.id !== compositionManifest.music?.track_asset_id)
        .map((asset) => ({
          media_type: asset.media_type,
          alt_text: accessibilityByAssetId.get(asset.id)?.alt_text,
        })), false);
      if (altTextError) return res.status(400).json({ error: altTextError });
    }
    if (stagedAssets.some((asset) => asset.status === "failed")) {
      return res.status(409).json({ error: "One or more uploaded assets failed processing. Retry processing or choose another file.", error_code: "MOMENT_MEDIA_FAILED" });
    }
    if (stagedAssets.some((asset) => asset.media_type === "video" && (asset.duration_ms ?? 0) > 60_000)) {
      return res.status(400).json({ error: "Story videos must be 60 seconds or shorter." });
    }
    for (const asset of stagedAssets) {
      const accessibility = accessibilityByAssetId.get(asset.id);
      if (!accessibility) continue;
      if (!["photo", "video"].includes(asset.media_type) || accessibility.captions_vtt && asset.media_type !== "video") {
        return res.status(400).json({ error: "Alt text is for image/video attachments and caption cues are for videos." });
      }
      if (accessibility.captions_vtt) {
        const captionError = validateMomentCaptionsVtt(accessibility.captions_vtt, (asset.duration_ms ?? 60_000) / 1000);
        if (captionError) return res.status(400).json({ error: captionError });
      }
    }
    const stagedById = new Map(stagedAssets.map((asset) => [asset.id, asset]));
    if (mediaEdits.some((edit) => {
      const asset = stagedById.get(edit.media_asset_id);
      return !asset || asset.media_type !== "video" || asset.duration_ms == null
        || !Number.isFinite(edit.cover_time_ms) || edit.cover_time_ms < 0
        || edit.cover_time_ms >= asset.duration_ms;
    })) {
      return res.status(400).json({ error: "Each video cover time must be within the probed video duration." });
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
    const musicAssetId = compositionManifest.music?.track_asset_id ?? null;
    const musicAsset = musicAssetId === null ? null : stagedAssets.find((asset) => asset.id === musicAssetId);
    const attestedMusicAssets = stagedAssets.filter((asset) => isMomentMusicAsset(asset.metadata, userId));
    if (attestedMusicAssets.some((asset) => asset.id !== musicAssetId)
      || musicAssetId !== null && (!musicAsset || musicAsset.media_type !== "audio"
        || !musicAsset.mime_type.startsWith("audio/")
        || !isMomentMusicAsset(musicAsset.metadata, userId))) {
      return res.status(400).json({ error: "Choose an audio track uploaded with your account and confirm its music rights before publishing." });
    }
    if (musicAssetId !== null && (exchangeListingId !== null
      || !stagedAssets.some((asset) => asset.media_type === "video"))) {
      return res.status(400).json({ error: "Background music is available for video Community and Hub Moments, not Exchange Sparks or photo-only Moments." });
    }
  }
  const moderation = moderatePostText(caption ?? "");
  if (parsed.data.archive_enabled && moderation.status !== "approved") {
    return res.status(409).json({
      error: "A Moment can be saved to your private archive after moderation approval.",
      error_code: "MOMENT_ARCHIVE_REQUIRES_APPROVAL",
    });
  }
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
    for (const item of decodedMedia) {
      if (item.captions_vtt && item.media_type !== "video") {
        return res.status(400).json({ error: "Caption cues can only be added to video attachments." });
      }
      if (item.captions_vtt) {
        const captionError = validateMomentCaptionsVtt(item.captions_vtt, (item.metadata?.duration_ms ?? 60_000) / 1000);
        if (captionError) return res.status(400).json({ error: captionError });
      }
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
      .where(and(
        inArray(usersTable.id, mentionIds),
        eq(usersTable.approval_status, "approved"),
        eq(usersTable.is_suspended, false),
        eq(usersTable.deletion_status, "active"),
      )) : [];
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
      const musicAssetId = compositionManifest.music?.track_asset_id ?? null;
      const musicAsset = musicAssetId === null ? null : stagedAssets.find((asset) => asset.id === musicAssetId);
      if (stagedAssets.some((asset) => asset.media_type === "audio" && asset.id !== musicAssetId)
        || stagedAssets.some((asset) => isMomentMusicAsset(asset.metadata, userId) && asset.id !== musicAssetId)
        || musicAssetId !== null && (!musicAsset || musicAsset.media_type !== "audio"
          || !isMomentMusicAsset(musicAsset.metadata, userId))) {
        return { kind: "music_invalid" as const };
      }
      if (musicAssetId !== null && (exchangeListingId !== null
        || !stagedAssets.some((asset) => asset.media_type === "video"))) {
        return { kind: "music_context_invalid" as const };
      }
      const coverEdits = new Map(mediaEdits.map((edit) => [edit.media_asset_id, edit.cover_time_ms]));
      if (coverEdits.size) {
        for (const asset of stagedAssets) {
          const coverTime = coverEdits.get(asset.id);
          if (coverTime !== undefined && (asset.media_type !== "video" || asset.duration_ms == null
            || !Number.isFinite(coverTime) || coverTime < 0 || coverTime >= asset.duration_ms)) {
            return { kind: "invalid_cover_time" as const };
          }
        }
      }
      const [story] = await tx.insert(communityStoriesTable).values({
        author_user_id: userId,
        hub_id: hubId,
        community_id: viewer?.community_id ?? null,
        exchange_listing_id: exchangeListingId,
        client_publish_id: parsed.data.client_publish_id ?? null,
        publish_payload_hash: publishPayloadHash,
        caption,
        tags,
        audience: parsed.data.audience,
        status: moderation.status === "approved" ? "published" : "pending",
        reply_enabled: parsed.data.reply_enabled,
        archive_enabled: parsed.data.archive_enabled,
        remix_enabled: parsed.data.remix_enabled,
        response_to_story_id: parsed.data.response_to_story_id ?? null,
        response_to_author_user_id: responseSource?.author_user_id ?? null,
        response_to_author_name: responseSource?.author_name ?? null,
        challenge_key: parsed.data.challenge_key ?? null,
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
          alt_text: cleanText(item.alt_text, 250) || null,
          captions_vtt: item.captions_vtt?.replace(/\r\n?/g, "\n").trim() ?? null,
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
          alt_text: cleanText(accessibilityByAssetId.get(asset.id)?.alt_text, 250) || null,
          captions_vtt: accessibilityByAssetId.get(asset.id)?.captions_vtt?.replace(/\r\n?/g, "\n").trim() ?? null,
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
        for (const asset of stagedAssets) {
          const coverTime = coverEdits.get(asset.id);
          if (coverTime !== undefined || musicAssetId !== null && asset.media_type === "video") {
            const assetManifest: StoryCompositionManifest = {
              ...compositionManifest,
              ...(asset.composition_manifest?.cover_time_ms !== undefined
                ? { cover_time_ms: asset.composition_manifest.cover_time_ms }
                : {}),
              ...(coverTime !== undefined ? { cover_time_ms: coverTime } : {}),
            };
            await tx.update(mediaAssetsTable).set({
              composition_manifest: assetManifest,
              updated_at: new Date(),
            }).where(eq(mediaAssetsTable.id, asset.id));
          }
          if (musicAssetId !== null && asset.media_type === "video") {
            mediaAssetJobs.push({ id: asset.id, mediaType: asset.media_type, manifest: compositionManifest });
          }
        }
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
          logger.info(buildCommunityStoryAuditEvent({
            action: "publish_replayed",
            actorUserId: userId,
            storyId: existing.id,
            storyStatus: existing.status,
          }), "community-story audit event");
          return res.status(200).json({
            story: { id: existing.id, status: existing.status, expires_at: existing.expires_at.toISOString() },
          });
        }
      }
      return res.status(404).json({ error: "One or more uploaded assets do not belong to this Moment context." });
    }
    if (result.kind === "media_failed") return res.status(409).json({ error: "One or more uploaded assets failed processing.", error_code: "MOMENT_MEDIA_FAILED" });
    if (result.kind === "music_invalid") return res.status(400).json({ error: "The selected soundtrack is not an attested audio asset owned by this account." });
    if (result.kind === "music_context_invalid") return res.status(400).json({ error: "Background music is available for video Community and Hub Moments, not Exchange Sparks or photo-only Moments." });
    if (result.kind === "media_too_long") return res.status(400).json({ error: "Story videos must be 60 seconds or shorter." });
    if (result.kind === "invalid_cover_time") return res.status(400).json({ error: "Each video cover time must be within the probed video duration." });
    if (result.kind === "media_not_ready") return res.status(409).json({ error: "Moment media is still processing. Retry after every file is ready.", error_code: "MOMENT_MEDIA_NOT_READY" });
    logger.info(buildCommunityStoryAuditEvent({
      action: "created",
      actorUserId: userId,
      storyId: result.story.id,
      storyStatus: result.story.status,
    }), "community-story audit event");
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
    if (mediaEdits.length) {
      try {
        const regenerated = await Promise.all(mediaEdits.map((edit) => regenerateMediaAssetThumbnail(edit.media_asset_id)));
        if (regenerated.some((queued) => !queued)) throw new Error("A selected video cover could not be queued.");
      } catch (error) {
        logger.error({ err: error, storyId: result.story.id }, "media-processing: cover thumbnail could not be published");
        return res.status(503).json({
          error: "Story saved, but cover thumbnail processing is temporarily unavailable. Please refresh shortly.",
          error_code: "MEDIA_PROCESSING_UNAVAILABLE",
        });
      }
    }
    if (result.story.status === "published") {
      // Story audiences are community/Hub-scoped; a global event would disclose
      // private Story IDs and author/Hub metadata to unrelated connected users.
      try {
        const visibleMentionUsers = await filterStoryMentionRecipientsByVisibility(
          mentionUsers,
          userId,
          (recipientUserId) => viewerCanReadStory(recipientUserId, result.story),
        );
        if (visibleMentionUsers.length) {
          const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
          await Promise.all(visibleMentionUsers.map((user) => createMessageNotification({
            userId: user.id,
            actorUserId: userId,
            type: "story_mention",
            title: "You were mentioned in a Story",
            body: `${author?.name ?? "A neighbor"} mentioned you in a Community Story.`,
            actionUrl: `/community?storyId=${result.story.id}`,
            metadata: { story_id: result.story.id, mention_user_id: user.id },
          })));
        }
      } catch (error) {
        // Publication already committed. Notification failure must not trigger
        // upload-object cleanup for a Story whose media is now live.
        logger.warn({ err: error, storyId: result.story.id }, "community-story mention notification dispatch failed after publish");
      }
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
        logger.info(buildCommunityStoryAuditEvent({
          action: "publish_replayed",
          actorUserId: userId,
          storyId: existing.id,
          storyStatus: existing.status,
        }), "community-story audit event");
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
    archive_enabled: communityStoriesTable.archive_enabled,
    featured_at: communityStoriesTable.featured_at,
  }).from(communityStoryMediaTable)
    .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(eq(communityStoryMediaTable.id, mediaId))
    .limit(1);
  if (!row || row.status !== "published"
      || row.media_asset_id !== null && row.asset_status !== "ready"
      || !(await viewerCanReadRetainedStory(req.authenticatedUserId!, row))) {
    return res.status(404).json({ error: "Story media not found." });
  }
  if (row.expires_at <= new Date()) {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
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
      process.env["SESSION_SECRET"] ?? "",
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

router.post("/community/stories/:id/moment-composition/playback-grant", requireAuth, requireApproved, async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return res.status(404).json({ error: "Moment video not found." });
  const storyId = positiveId(req.params.id);
  const userId = req.authenticatedUserId!;
  const composition = storyId ? await momentCompositionForStory(storyId) : null;
  if (!composition || composition.status !== "ready" || composition.asset_status !== "ready"
    || !composition.variant_key || composition.story_status !== "published"
    || composition.expires_at <= new Date() || !(await viewerCanReadStory(userId, composition))) {
    return res.status(404).json({ error: "Moment video not found." });
  }
  const [viewer] = await db.select({
    token_version: usersTable.token_version,
    approval_status: usersTable.approval_status,
    is_suspended: usersTable.is_suspended,
    trust_score: usersTable.trust_score,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const secret = process.env["SESSION_SECRET"];
  if (!viewer || viewer.approval_status !== "approved" || viewer.is_suspended
    || viewer.trust_score !== null && viewer.trust_score <= -1) {
    return res.status(404).json({ error: "Moment video not found." });
  }
  if (req.authenticatedTokenVersion !== viewer.token_version) {
    return res.status(401).json({ error: "Session expired — please log in again", error_code: "TOKEN_REVOKED" });
  }
  if (!secret || secret.length < 32) {
    return res.status(503).json({ error: "Secure Moment playback is temporarily unavailable." });
  }
  const grant = issueStoryPlaybackGrant({
    mediaId: composition.derived_media_asset_id,
    userId,
    tokenVersion: viewer.token_version,
  }, secret);
  const cookiePath = `/api/community/stories/${storyId}/moment-composition/play`;
  res.setHeader("Set-Cookie", buildStoryPlaybackSetCookie(
    grant.value,
    composition.derived_media_asset_id,
    req.secure || req.protocol === "https",
    cookiePath,
  ));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  return res.json({
    playback_url: cookiePath,
    expires_at: new Date(grant.claims.expiresAt).toISOString(),
  });
});

router.get("/community/stories/:id/moment-composition/play", async (req, res) => {
  if (!isMediaPlatformV21Enabled()) return res.status(404).json({ error: "Moment video not found." });
  const storyId = positiveId(req.params.id);
  const cookieValue = readStoryPlaybackCookie(req.headers.cookie);
  const secret = process.env["SESSION_SECRET"];
  const tokenMediaId = cookieValue ? positiveId(cookieValue.split(".")[1]) : null;
  const claims = secret && tokenMediaId ? verifyStoryPlaybackGrant(cookieValue, tokenMediaId, secret) : null;
  if (!storyId || !claims) return res.status(404).json({ error: "Moment video not found." });
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
    return res.status(404).json({ error: "Moment video not found." });
  }
  const composition = await momentCompositionForStory(storyId);
  if (!composition || claims.mediaId !== composition.derived_media_asset_id
    || composition.status !== "ready" || composition.asset_status !== "ready"
    || !composition.variant_key || composition.story_status !== "published"
    || composition.expires_at <= new Date() || !(await viewerCanReadStory(viewer.id, composition))) {
    return res.status(404).json({ error: "Moment video not found." });
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Cookie");
  return streamAssetRange(
    composition.variant_key,
    req,
    res,
    storyVideoStreamContentType(composition.variant_key, composition.mime_type),
  );
});

router.delete("/community/stories/:id", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  const actorUserId = req.authenticatedUserId!;
  const [ownedStory] = await db.update(communityStoriesTable).set({ status: "deletion_pending" }).where(and(
    eq(communityStoriesTable.id, storyId),
    eq(communityStoriesTable.author_user_id, actorUserId),
  )).returning({ id: communityStoriesTable.id });
  if (!ownedStory) {
    logger.info(buildCommunityStoryAuditEvent({
      action: "delete_result",
      actorUserId,
      storyId,
      deleted: false,
      reason: "not_found_or_not_owned",
    }), "community-story audit event");
    return res.json({ deleted: false });
  }
  const universalAssets = await db.select({
    id: mediaAssetsTable.id,
    original_key: mediaAssetsTable.original_key,
    variant_key: mediaAssetsTable.variant_key,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
    cleanup_keys: mediaAssetsTable.cleanup_keys,
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
      logger.info(buildCommunityStoryAuditEvent({
        action: "delete_result",
        actorUserId,
        storyId,
        deleted: false,
        reason: "media_processing",
      }), "community-story audit event");
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
    ...universalAssets.flatMap((asset) => mediaStorageKeys(asset)),
  ].filter((key): key is string => Boolean(key)))];
  const cleanup = await Promise.allSettled(storageKeys.map((key) => deleteAssetStrict(key)));
  const cleanupFailure = cleanup.find((result) => result.status === "rejected");
  if (cleanupFailure?.status === "rejected") {
    logger.error({ storyId }, "community-story: storage cleanup failed; Story kept for retry");
    logger.info(buildCommunityStoryAuditEvent({
      action: "delete_result",
      actorUserId,
      storyId,
      deleted: false,
      reason: "storage_cleanup_failed",
    }), "community-story audit event");
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
      eq(communityStoriesTable.author_user_id, actorUserId),
    )).returning({ id: communityStoriesTable.id });
    if (deleted.length > 0) {
      logger.info(buildCommunityStoryAuditEvent({
        action: "delete_result",
        actorUserId,
        storyId,
        deleted: true,
      }), "community-story audit event");
      return res.json({ deleted: true });
    }
    logger.info(buildCommunityStoryAuditEvent({
      action: "delete_result",
      actorUserId,
      storyId,
      deleted: false,
      reason: "row_missing_after_cleanup",
    }), "community-story audit event");
    return res.json({ deleted: false });
  } catch {
    logger.error({ storyId }, "community-story: row cleanup failed; Story kept for retry");
    logger.info(buildCommunityStoryAuditEvent({
      action: "delete_result",
      actorUserId,
      storyId,
      deleted: false,
      reason: "row_cleanup_failed",
    }), "community-story audit event");
    return res.status(503).json({
      deleted: false,
      error: "Story cleanup could not be completed. The Story was kept so cleanup can be retried.",
      error_code: "STORY_MEDIA_CLEANUP_FAILED",
    });
  }
});

export default router;