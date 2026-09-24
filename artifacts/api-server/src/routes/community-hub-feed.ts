/**
 * V17.1 — Canonical Hub-scoped Community feed.
 *
 * GET /api/community/hubs/:hubId/feed
 *
 * This is an additive read model. It does not create membership, change
 * representation rights, or infer Hub membership from location.
 */
import { Router } from "express";
import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  diasporaHubsTable,
  hubCommunityPostCommentsTable,
  hubCommunityPostMediaTable,
  hubCommunityPostReactionsTable,
  communityMediaSavesTable,
  hubCommunityPostsTable,
  gratitudePostsTable,
  hubMembershipsTable,
  mediaAssetsTable,
  requestsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { communityLikeLimiter, communityPostLimiter, generalApiLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { deleteAsset, putAsset, streamOrRedirectAsset } from "../lib/storage";
import { broadcast } from "../lib/ws-hub";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { enqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue";
import { mediaProcessingQueue } from "../lib/queue";
import { logger } from "../lib/logger";

const router = Router();

function parseHubId(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const CreateCommunityPostBody = z.object({
  body: z.string().trim().min(1).max(5000),
});

const CreateCommunityCommentBody = z.object({
  body: z.string().trim().min(1).max(2000),
});

const CreateCommunityMediaBody = z.object({
  data_url: z.string().min(1).max(8_000_000),
  alt_text: z.string().trim().max(200).optional(),
});

const CommunityReactionBody = z.object({
  reaction: z.enum(["heart", "support", "celebrate"]).default("heart"),
});

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
]);

function decodeMediaDataUrl(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !MEDIA_MIME_TYPES.has(match[1])) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) return null;
  return { buffer, mimeType: match[1] };
}

async function isApprovedHubMember(userId: number, hubId: number): Promise<boolean> {
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

async function canonicalHubExists(hubId: number): Promise<boolean> {
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

const approvedVisibleUser = and(
  eq(usersTable.approval_status, "approved"),
  eq(usersTable.is_suspended, false),
);

async function visibleCommunityMediaForViewer(mediaId: number, userId: number): Promise<{ id: number; hub_id: number } | null> {
  const [media] = await db
    .select({
      id: hubCommunityPostMediaTable.id,
      hub_id: hubCommunityPostsTable.hub_id,
    })
    .from(hubCommunityPostMediaTable)
    .innerJoin(hubCommunityPostsTable, eq(hubCommunityPostsTable.id, hubCommunityPostMediaTable.post_id))
    .innerJoin(usersTable, eq(usersTable.id, hubCommunityPostsTable.author_id))
    .where(and(
      eq(hubCommunityPostMediaTable.id, mediaId),
      eq(hubCommunityPostsTable.moderation_status, "approved"),
      approvedVisibleUser,
    ))
    .limit(1);
  if (!media || !(await canonicalHubExists(media.hub_id))) return null;
  if (!(await isApprovedHubMember(userId, media.hub_id))) return null;
  return media;
}

router.get("/community/my-hub", requireAuth, async (req, res) => {
  const callerId = req.authenticatedUserId!;
  const [row] = await db
    .select({ diaspora_hub_id: usersTable.diaspora_hub_id })
    .from(usersTable)
    .where(eq(usersTable.id, callerId))
    .limit(1);
  const rawHubId = row?.diaspora_hub_id ?? null;
  if (!rawHubId) return res.json({ hub_id: null });

  const [hub] = await db
    .select({
      id: diasporaHubsTable.id,
      primary_hub_id: diasporaHubsTable.primary_hub_id,
      status: diasporaHubsTable.status,
    })
    .from(diasporaHubsTable)
    .where(eq(diasporaHubsTable.id, rawHubId))
    .limit(1);
  if (!hub || hub.status !== "approved") return res.json({ hub_id: null });
  const effectiveHubId = hub.primary_hub_id ?? hub.id;
  if (!(await canonicalHubExists(effectiveHubId))) return res.json({ hub_id: null });
  return res.json({ hub_id: effectiveHubId });
});

router.get("/community/hubs/:hubId/feed", requireAuth, async (req, res) => {
  const rawHubId = Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId;
  const hubId = parseHubId(rawHubId);
  if (!hubId) {
    return res.status(400).json({ error: "hubId must be a positive integer." });
  }

  // Globe Hubs are canonical roots only. Child/local Hubs remain discoverable
  // through their parent context and are not promoted to Globe feed roots.
  const [hub] = await db
    .select({
      id: diasporaHubsTable.id,
      name: diasporaHubsTable.name,
      display_name: diasporaHubsTable.display_name,
      region: diasporaHubsTable.region_label,
      country_code: diasporaHubsTable.country_code,
      subdivision_code: diasporaHubsTable.subdivision_code,
      hub_scope: diasporaHubsTable.hub_scope,
    })
    .from(diasporaHubsTable)
    .where(and(
      eq(diasporaHubsTable.id, hubId),
      eq(diasporaHubsTable.status, "approved"),
      isNull(diasporaHubsTable.primary_hub_id),
    ))
    .limit(1);

  if (!hub) {
    return res.status(404).json({ error: "Canonical Hub not found." });
  }

  const memberWhere = and(
    eq(hubMembershipsTable.hub_id, hubId),
    eq(hubMembershipsTable.status, "approved"),
    eq(usersTable.approval_status, "approved"),
    eq(usersTable.is_suspended, false),
  );

  const gratitudeWhere = and(
    eq(gratitudePostsTable.moderation_status, "approved"),
    eq(usersTable.diaspora_hub_id, hubId),
    approvedVisibleUser,
  );

  const requestWhere = and(
    eq(requestsTable.status, "open"),
    eq(requestsTable.moderation_status, "approved"),
    or(
      eq(usersTable.diaspora_hub_id, hubId),
      eq(requestsTable.hub_id, hubId),
    ),
    approvedVisibleUser,
  );

  const [gratitude, openRequests, memberCountRows, gratitudeCountRows, requestCountRows, postCountRows] = await Promise.all([
    db
      .select({
        id: gratitudePostsTable.id,
        author_name: gratitudePostsTable.author_name,
        author_avatar: gratitudePostsTable.author_avatar,
        helper_name: gratitudePostsTable.helper_name,
        message: gratitudePostsTable.message,
        request_title: gratitudePostsTable.request_title,
        likes: gratitudePostsTable.likes,
        created_at: gratitudePostsTable.created_at,
      })
      .from(gratitudePostsTable)
      .innerJoin(usersTable, eq(usersTable.id, gratitudePostsTable.author_id))
      .where(gratitudeWhere)
      .orderBy(desc(gratitudePostsTable.created_at))
      .limit(30),

    db
      .select({
        id: requestsTable.id,
        title: requestsTable.title,
        category: requestsTable.category,
        urgency: requestsTable.urgency,
        status: requestsTable.status,
        created_at: requestsTable.created_at,
      })
      .from(requestsTable)
      .innerJoin(usersTable, eq(usersTable.id, requestsTable.requester_id))
      .where(requestWhere)
      .orderBy(desc(requestsTable.created_at))
      .limit(20),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hubMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
      .where(memberWhere),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(gratitudePostsTable)
      .innerJoin(usersTable, eq(usersTable.id, gratitudePostsTable.author_id))
      .where(gratitudeWhere),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(requestsTable)
      .innerJoin(usersTable, eq(usersTable.id, requestsTable.requester_id))
      .where(requestWhere),

    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hubCommunityPostsTable)
      .innerJoin(usersTable, eq(usersTable.id, hubCommunityPostsTable.author_id))
      .where(and(
        eq(hubCommunityPostsTable.hub_id, hubId),
        eq(hubCommunityPostsTable.moderation_status, "approved"),
        approvedVisibleUser,
      )),
  ]);

  const communityPosts = await db
    .select({
      id: hubCommunityPostsTable.id,
      body: hubCommunityPostsTable.body,
      author_id: hubCommunityPostsTable.author_id,
      author_name: usersTable.name,
      author_avatar: usersTable.avatar_url,
      created_at: hubCommunityPostsTable.created_at,
    })
    .from(hubCommunityPostsTable)
    .innerJoin(usersTable, eq(usersTable.id, hubCommunityPostsTable.author_id))
    .where(and(
      eq(hubCommunityPostsTable.hub_id, hubId),
      eq(hubCommunityPostsTable.moderation_status, "approved"),
      approvedVisibleUser,
    ))
    .orderBy(desc(hubCommunityPostsTable.created_at))
    .limit(30);

  const postIds = communityPosts.map((post) => post.id);
  type PostMediaRow = {
    id: number;
    post_id: number;
    mime_type: string;
    alt_text: string | null;
    media_asset_id: number | null;
    media_status: string | null;
  };
  type PostCommentRow = { id: number; post_id: number; body: string; author_name: string; author_avatar: string | null; created_at: Date };
  let postMedia: PostMediaRow[] = [];
  let postComments: PostCommentRow[] = [];
  let postReactionCounts: Array<{ post_id: number; count: number }> = [];
  let viewerReactions: Array<{ post_id: number; reaction: string }> = [];
  if (postIds.length > 0) {
    [postMedia, postComments, postReactionCounts, viewerReactions] = await Promise.all([
      db.select({
        id: hubCommunityPostMediaTable.id,
        post_id: hubCommunityPostMediaTable.post_id,
        mime_type: hubCommunityPostMediaTable.mime_type,
        alt_text: hubCommunityPostMediaTable.alt_text,
        media_asset_id: hubCommunityPostMediaTable.media_asset_id,
        media_status: mediaAssetsTable.status,
      }).from(hubCommunityPostMediaTable)
        .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, hubCommunityPostMediaTable.media_asset_id))
        .where(inArray(hubCommunityPostMediaTable.post_id, postIds)),
      db.select({
        id: hubCommunityPostCommentsTable.id,
        post_id: hubCommunityPostCommentsTable.post_id,
        body: hubCommunityPostCommentsTable.body,
        author_name: usersTable.name,
        author_avatar: usersTable.avatar_url,
        created_at: hubCommunityPostCommentsTable.created_at,
      }).from(hubCommunityPostCommentsTable)
        .innerJoin(usersTable, eq(usersTable.id, hubCommunityPostCommentsTable.author_id))
        .where(and(
          inArray(hubCommunityPostCommentsTable.post_id, postIds),
          eq(hubCommunityPostCommentsTable.moderation_status, "approved"),
          approvedVisibleUser,
        ))
        .orderBy(desc(hubCommunityPostCommentsTable.created_at)),
      db.select({
        post_id: hubCommunityPostReactionsTable.post_id,
        count: sql<number>`count(*)::int`,
      }).from(hubCommunityPostReactionsTable)
        .where(inArray(hubCommunityPostReactionsTable.post_id, postIds))
        .groupBy(hubCommunityPostReactionsTable.post_id),
      db.select({
        post_id: hubCommunityPostReactionsTable.post_id,
        reaction: hubCommunityPostReactionsTable.reaction,
      }).from(hubCommunityPostReactionsTable)
        .where(and(
          inArray(hubCommunityPostReactionsTable.post_id, postIds),
          eq(hubCommunityPostReactionsTable.user_id, req.authenticatedUserId!),
        )),
    ]);
  }

  const mediaByPost = new Map<number, typeof postMedia>();
  for (const media of postMedia) {
    const list = mediaByPost.get(media.post_id) ?? [];
    list.push(media);
    mediaByPost.set(media.post_id, list);
  }
  const commentsByPost = new Map<number, typeof postComments>();
  for (const comment of postComments) {
    const list = commentsByPost.get(comment.post_id) ?? [];
    if (list.length < 5) list.push(comment);
    commentsByPost.set(comment.post_id, list);
  }
  const reactionCounts = new Map(postReactionCounts.map((row) => [row.post_id, Number(row.count)]));
  const viewerReactionSet = new Set(viewerReactions.map((row) => `${row.post_id}:${row.reaction}`));
  const posts = communityPosts.map((post) => ({
    ...post,
    media: (mediaByPost.get(post.id) ?? []).map((media) => ({
      ...media,
      media_url: `/api/community/media/${media.id}`,
      thumbnail_url: media.media_asset_id ? `/api/community/media/${media.id}?variant=thumbnail` : null,
    })),
    comments: commentsByPost.get(post.id) ?? [],
    reaction_count: reactionCounts.get(post.id) ?? 0,
    viewer_reacted: viewerReactionSet.has(`${post.id}:heart`),
  }));

  const viewerCanPost = await isApprovedHubMember(req.authenticatedUserId!, hubId);

  return res.json({
    hub: {
      id: hub.id,
      name: hub.name,
      display_name: hub.display_name ?? hub.name,
      region: hub.region,
      country_code: hub.country_code,
      subdivision_code: hub.subdivision_code,
      hub_scope: hub.hub_scope,
    },
    counts: {
      members: Number(memberCountRows[0]?.count ?? 0),
      open_requests: Number(requestCountRows[0]?.count ?? 0),
      gratitude: Number(gratitudeCountRows[0]?.count ?? 0),
      posts: Number(postCountRows[0]?.count ?? 0),
    },
    gratitude,
    requests: openRequests,
    posts,
    permissions: {
      can_post: viewerCanPost,
      can_comment: viewerCanPost,
      can_react: viewerCanPost,
    },
    actions: {
      community: `/community?hubId=${hubId}`,
      messages: `/messages?mode=hub&sourceHub=${hubId}`,
      spirals: `/audio-spirals?hubId=${hubId}`,
    },
    context: {
      membership_is_not_inferred_from_location: true,
      spirals_are_curated: true,
    },
  });
});

/**
 * Visual discovery is a read model over approved Hub posts and their attached
 * media. It deliberately stays separate from the universal media platform:
 * visibility is still governed by Hub membership and post moderation.
 */
router.get("/community/hubs/:hubId/media", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const rawHubId = Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId;
  const hubId = parseHubId(rawHubId);
  if (!hubId) return res.status(400).json({ error: "hubId must be a positive integer." });

  const [hub] = await db
    .select({
      id: diasporaHubsTable.id,
      name: diasporaHubsTable.name,
      display_name: diasporaHubsTable.display_name,
      region: diasporaHubsTable.region_label,
    })
    .from(diasporaHubsTable)
    .where(and(
      eq(diasporaHubsTable.id, hubId),
      eq(diasporaHubsTable.status, "approved"),
      isNull(diasporaHubsTable.primary_hub_id),
    ))
    .limit(1);

  if (!hub) return res.status(404).json({ error: "Canonical Hub not found." });
  if (!(await isApprovedHubMember(req.authenticatedUserId!, hubId))) {
    return res.status(403).json({ error: "Approved Hub membership is required to view Hub media." });
  }

  const rawCursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const cursor = rawCursor ? parseHubId(rawCursor) : null;
  if (rawCursor && !cursor) return res.status(400).json({ error: "cursor must be a positive integer." });

  const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 18;
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 6), 30) : 18;
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const kind = typeof req.query.kind === "string" && ["photo", "video", "audio"].includes(req.query.kind)
    ? req.query.kind
    : "all";
  const kindPattern = kind === "photo" ? "image/%" : kind === "video" ? "video/%" : kind === "audio" ? "audio/%" : null;

  const conditions = [
    eq(hubCommunityPostsTable.hub_id, hubId),
    eq(hubCommunityPostsTable.moderation_status, "approved"),
    approvedVisibleUser,
    ...(cursor ? [lt(hubCommunityPostMediaTable.id, cursor)] : []),
    ...(query ? [ilike(hubCommunityPostsTable.body, `%${query}%`)] : []),
    ...(kindPattern ? [sql`${hubCommunityPostMediaTable.mime_type} LIKE ${kindPattern}`] : []),
  ];

  const rows = await db
    .select({
      id: hubCommunityPostMediaTable.id,
      post_id: hubCommunityPostMediaTable.post_id,
      mime_type: hubCommunityPostMediaTable.mime_type,
      alt_text: hubCommunityPostMediaTable.alt_text,
      media_asset_id: hubCommunityPostMediaTable.media_asset_id,
      media_status: mediaAssetsTable.status,
      viewer_save_id: communityMediaSavesTable.id,
      thumbnail_key: mediaAssetsTable.thumbnail_key,
      variant_key: mediaAssetsTable.variant_key,
      body: hubCommunityPostsTable.body,
      author_name: usersTable.name,
      author_avatar: usersTable.avatar_url,
      created_at: hubCommunityPostsTable.created_at,
    })
    .from(hubCommunityPostMediaTable)
    .innerJoin(hubCommunityPostsTable, eq(hubCommunityPostsTable.id, hubCommunityPostMediaTable.post_id))
    .innerJoin(usersTable, eq(usersTable.id, hubCommunityPostsTable.author_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, hubCommunityPostMediaTable.media_asset_id))
    .leftJoin(communityMediaSavesTable, and(
      eq(communityMediaSavesTable.media_id, hubCommunityPostMediaTable.id),
      eq(communityMediaSavesTable.user_id, req.authenticatedUserId!),
    ))
    .where(and(...conditions))
    .orderBy(desc(hubCommunityPostMediaTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const items = visibleRows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    mime_type: row.mime_type,
    alt_text: row.alt_text,
    media_asset_id: row.media_asset_id,
    media_status: row.media_status,
     viewer_saved: Boolean(row.viewer_save_id),
    body: row.body,
    author_name: row.author_name,
    author_avatar: row.author_avatar,
    created_at: row.created_at,
    media_url: `/api/community/media/${row.id}`,
    thumbnail_url: row.thumbnail_key ? `/api/community/media/${row.id}?variant=thumbnail` : null,
    context: {
      label: "Shared in the community",
      href: `/community?hubId=${hubId}&postId=${row.post_id}`,
    },
  }));

  return res.json({
    hub: {
      id: hub.id,
      name: hub.name,
      display_name: hub.display_name ?? hub.name,
      region: hub.region,
    },
    items,
    next_cursor: hasMore && items.length > 0 ? String(items[items.length - 1].id) : null,
    has_more: hasMore,
    filters: { q: query, kind },
  });
});

router.get("/community/hubs/:hubId/saved-media", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const rawHubId = Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId;
  const hubId = parseHubId(rawHubId);
  if (!hubId) return res.status(400).json({ error: "hubId must be a positive integer." });

  const [hub] = await db
    .select({
      id: diasporaHubsTable.id,
      name: diasporaHubsTable.name,
      display_name: diasporaHubsTable.display_name,
      region: diasporaHubsTable.region_label,
    })
    .from(diasporaHubsTable)
    .where(and(
      eq(diasporaHubsTable.id, hubId),
      eq(diasporaHubsTable.status, "approved"),
      isNull(diasporaHubsTable.primary_hub_id),
    ))
    .limit(1);

  if (!hub) return res.status(404).json({ error: "Canonical Hub not found." });
  if (!(await isApprovedHubMember(req.authenticatedUserId!, hubId))) {
    return res.status(403).json({ error: "Approved Hub membership is required to view saved media." });
  }

  const rawCursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const cursor = rawCursor ? parseHubId(rawCursor) : null;
  if (rawCursor && !cursor) return res.status(400).json({ error: "cursor must be a positive integer." });

  const rawLimit = typeof req.query.limit === "string" ? Number(req.query.limit) : 18;
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 6), 30) : 18;
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const kind = typeof req.query.kind === "string" && ["photo", "video", "audio"].includes(req.query.kind)
    ? req.query.kind
    : "all";
  const kindPattern = kind === "photo" ? "image/%" : kind === "video" ? "video/%" : kind === "audio" ? "audio/%" : null;

  const conditions = [
    eq(communityMediaSavesTable.user_id, req.authenticatedUserId!),
    eq(hubCommunityPostsTable.hub_id, hubId),
    eq(hubCommunityPostsTable.moderation_status, "approved"),
    approvedVisibleUser,
    ...(cursor ? [lt(communityMediaSavesTable.id, cursor)] : []),
    ...(query ? [ilike(hubCommunityPostsTable.body, `%${query}%`)] : []),
    ...(kindPattern ? [sql`${hubCommunityPostMediaTable.mime_type} LIKE ${kindPattern}`] : []),
  ];

  const rows = await db
    .select({
      save_id: communityMediaSavesTable.id,
      id: hubCommunityPostMediaTable.id,
      post_id: hubCommunityPostMediaTable.post_id,
      mime_type: hubCommunityPostMediaTable.mime_type,
      alt_text: hubCommunityPostMediaTable.alt_text,
      media_asset_id: hubCommunityPostMediaTable.media_asset_id,
      media_status: mediaAssetsTable.status,
      thumbnail_key: mediaAssetsTable.thumbnail_key,
      variant_key: mediaAssetsTable.variant_key,
      body: hubCommunityPostsTable.body,
      author_name: usersTable.name,
      author_avatar: usersTable.avatar_url,
      created_at: hubCommunityPostsTable.created_at,
    })
    .from(communityMediaSavesTable)
    .innerJoin(hubCommunityPostMediaTable, eq(hubCommunityPostMediaTable.id, communityMediaSavesTable.media_id))
    .innerJoin(hubCommunityPostsTable, eq(hubCommunityPostsTable.id, hubCommunityPostMediaTable.post_id))
    .innerJoin(usersTable, eq(usersTable.id, hubCommunityPostsTable.author_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, hubCommunityPostMediaTable.media_asset_id))
    .where(and(...conditions))
    .orderBy(desc(communityMediaSavesTable.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;
  const items = visibleRows.map((row) => ({
    id: row.id,
    post_id: row.post_id,
    mime_type: row.mime_type,
    alt_text: row.alt_text,
    media_asset_id: row.media_asset_id,
    media_status: row.media_status,
    viewer_saved: true,
    body: row.body,
    author_name: row.author_name,
    author_avatar: row.author_avatar,
    created_at: row.created_at,
    media_url: `/api/community/media/${row.id}`,
    thumbnail_url: row.thumbnail_key ? `/api/community/media/${row.id}?variant=thumbnail` : null,
    context: {
      label: "Saved from this Hub",
      href: `/community?hubId=${hubId}&postId=${row.post_id}`,
    },
  }));

  return res.json({
    hub: {
      id: hub.id,
      name: hub.name,
      display_name: hub.display_name ?? hub.name,
      region: hub.region,
    },
    items,
    next_cursor: hasMore && items.length > 0 ? String(visibleRows[visibleRows.length - 1]!.save_id) : null,
    has_more: hasMore,
    filters: { q: query, kind },
  });
});

router.post("/community/hubs/:hubId/posts", requireAuth, communityPostLimiter, async (req, res) => {
  const hubId = parseHubId(Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId);
  if (!hubId) return res.status(400).json({ error: "hubId must be a positive integer." });
  const parsed = CreateCommunityPostBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Post text must be between 1 and 5000 characters." });
  if (!(await canonicalHubExists(hubId))) return res.status(404).json({ error: "Canonical Hub not found." });
  if (!(await isApprovedHubMember(req.authenticatedUserId!, hubId))) {
    return res.status(403).json({ error: "Approved Hub membership is required to post." });
  }

  const [author] = await db
    .select({ name: usersTable.name, avatar_url: usersTable.avatar_url })
    .from(usersTable)
    .where(eq(usersTable.id, req.authenticatedUserId!))
    .limit(1);
  if (!author) return res.status(401).json({ error: "User not found." });

  const moderation = moderatePostText(parsed.data.body);
  const [post] = await db.insert(hubCommunityPostsTable).values({
    hub_id: hubId,
    author_id: req.authenticatedUserId!,
    body: parsed.data.body,
    moderation_status: moderation.status,
    moderation_reason: moderation.reason,
  }).returning();
  if (!post) return res.status(500).json({ error: "Post could not be saved." });

  const publicPost = {
    id: post.id,
    hub_id: post.hub_id,
    body: post.body,
    author_id: post.author_id,
    author_name: author.name,
    author_avatar: author.avatar_url,
    created_at: post.created_at,
    media: [],
    comments: [],
    reaction_count: 0,
    viewer_reacted: false,
  };
  if (post.moderation_status === "approved") {
    broadcast({ type: "hub_community_post_created", payload: publicPost });
  }
  return res.status(201).json({ post: publicPost });
});

router.post("/community/hubs/:hubId/posts/:postId/media", requireAuth, communityPostLimiter, async (req, res) => {
  const hubId = parseHubId(Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId);
  const postId = parseHubId(Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId);
  if (!hubId || !postId) return res.status(400).json({ error: "Invalid Hub or post id." });
  const parsed = CreateCommunityMediaBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid media data URL is required." });
  if (!(await isApprovedHubMember(req.authenticatedUserId!, hubId))) {
    return res.status(403).json({ error: "Approved Hub membership is required to upload media." });
  }

  const [post] = await db.select({ id: hubCommunityPostsTable.id, author_id: hubCommunityPostsTable.author_id })
    .from(hubCommunityPostsTable)
    .where(and(eq(hubCommunityPostsTable.id, postId), eq(hubCommunityPostsTable.hub_id, hubId)))
    .limit(1);
  if (!post) return res.status(404).json({ error: "Community post not found." });
  if (post.author_id !== req.authenticatedUserId!) {
    return res.status(403).json({ error: "Only the post author can add media." });
  }

  const decoded = decodeMediaDataUrl(parsed.data.data_url);
  if (!decoded) {
    return res.status(400).json({ error: "Unsupported media type or file is larger than 5 MB." });
  }
  if (isMediaPlatformV21Enabled() && !mediaProcessingQueue) {
    return res.status(503).json({
      error: "Media processing is not available. Please try again shortly.",
      error_code: "MEDIA_PROCESSING_UNAVAILABLE",
    });
  }
  const extension = decoded.mimeType.split("/")[1].replace("jpeg", "jpg");
  const storageKey = `hub-community/${hubId}/${postId}/${randomUUID()}.${extension}`;
  let committed = false;
  try {
    await putAsset(storageKey, decoded.buffer, decoded.mimeType);
    const result = await db.transaction(async (tx) => {
      let mediaAssetId: number | null = null;
      let processingJob: { id: number; mediaType: string } | null = null;
      const mediaType = decoded.mimeType.startsWith("image/")
        ? "photo"
        : decoded.mimeType.startsWith("video/")
        ? "video"
        : decoded.mimeType.startsWith("audio/")
        ? "audio"
        : "document";
      if (isMediaPlatformV21Enabled()) {
        const [asset] = await tx.insert(mediaAssetsTable).values({
          owner_user_id: req.authenticatedUserId!,
          context_kind: "hub",
          context_id: hubId,
          media_type: mediaType,
          mime_type: decoded.mimeType,
          original_key: storageKey,
          byte_size: decoded.buffer.length,
        }).returning({ id: mediaAssetsTable.id });
        mediaAssetId = asset?.id ?? null;
        if (!mediaAssetId) throw new Error("Media asset could not be created.");
        processingJob = { id: mediaAssetId, mediaType };
      }
      const [media] = await tx.insert(hubCommunityPostMediaTable).values({
        post_id: postId,
        media_asset_id: mediaAssetId,
        storage_key: storageKey,
        mime_type: decoded.mimeType,
        byte_size: decoded.buffer.length,
        alt_text: parsed.data.alt_text ?? null,
      }).returning();
      if (!media) throw new Error("Media could not be saved.");
      return { media, mediaAssetId, processingJob };
    });
    committed = true;
    if (result.processingJob) {
      try {
        await enqueueMediaAssetProcessing(result.processingJob.id, result.processingJob.mediaType);
      } catch (error) {
        logger.error({ err: error, hubId, postId }, "media-processing: Hub media job could not be published");
        return res.status(503).json({
          error: "Media saved, but processing is temporarily unavailable. Please refresh shortly.",
          error_code: "MEDIA_PROCESSING_UNAVAILABLE",
        });
      }
    }
    void broadcast({
      type: "hub_community_post_updated",
      payload: { hub_id: hubId, post_id: postId, change: "media" },
    });
    return res.status(201).json({
      media: {
        id: result.media.id,
        post_id: result.media.post_id,
        mime_type: result.media.mime_type,
        alt_text: result.media.alt_text,
        media_asset_id: result.mediaAssetId,
        media_url: `/api/community/media/${result.media.id}`,
        thumbnail_url: result.mediaAssetId ? `/api/community/media/${result.media.id}?variant=thumbnail` : null,
      },
    });
  } catch (error) {
    if (!committed) await deleteAsset(storageKey);
    throw error;
  }
});

// Media is attached only to an approved, moderated Hub post. The storage key
// is UUID-based and the post-level visibility check prevents orphaned/private
// objects from becoming a generic file browser. This route intentionally does
// not require a bearer header so <img>, <video>, and <audio> elements work.
router.get("/community/media/:mediaId", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const rawMediaId = Array.isArray(req.params.mediaId) ? req.params.mediaId[0] : req.params.mediaId;
  const mediaId = parseHubId(rawMediaId);
  if (!mediaId) return res.status(400).json({ error: "Invalid media id." });
  const [media] = await db.select({
    storage_key: hubCommunityPostMediaTable.storage_key,
    media_asset_id: hubCommunityPostMediaTable.media_asset_id,
    variant_key: mediaAssetsTable.variant_key,
    thumbnail_key: mediaAssetsTable.thumbnail_key,
    hub_id: hubCommunityPostsTable.hub_id,
    moderation_status: hubCommunityPostsTable.moderation_status,
  }).from(hubCommunityPostMediaTable)
    .innerJoin(hubCommunityPostsTable, eq(hubCommunityPostsTable.id, hubCommunityPostMediaTable.post_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, hubCommunityPostMediaTable.media_asset_id))
    .where(eq(hubCommunityPostMediaTable.id, mediaId))
    .limit(1);
  if (!media || media.moderation_status !== "approved" || !(await canonicalHubExists(media.hub_id))) {
    return res.status(404).json({ error: "Media not found." });
  }
  if (!(await isApprovedHubMember(req.authenticatedUserId!, media.hub_id))) {
    return res.status(404).json({ error: "Media not found." });
  }
  const key = String(req.query.variant ?? "") === "thumbnail"
    ? media.thumbnail_key
    : media.variant_key ?? media.storage_key;
  if (!key) return res.status(409).json({ error: "Media variant is still processing." });
  await streamOrRedirectAsset(key, res);
  return;
});

router.post("/community/media/:mediaId/save", requireAuth, requireApproved, communityLikeLimiter, async (req, res) => {
  const rawMediaId = Array.isArray(req.params.mediaId) ? req.params.mediaId[0] : req.params.mediaId;
  const mediaId = parseHubId(rawMediaId);
  if (!mediaId) return res.status(400).json({ error: "Invalid media id." });

  const media = await visibleCommunityMediaForViewer(mediaId, req.authenticatedUserId!);
  if (!media) return res.status(404).json({ error: "Media not found." });

  await db.insert(communityMediaSavesTable).values({
    user_id: req.authenticatedUserId!,
    media_id: mediaId,
  }).onConflictDoNothing();

  return res.status(201).json({ media_id: mediaId, saved: true, private: true });
});

router.delete("/community/media/:mediaId/save", requireAuth, requireApproved, communityLikeLimiter, async (req, res) => {
  const rawMediaId = Array.isArray(req.params.mediaId) ? req.params.mediaId[0] : req.params.mediaId;
  const mediaId = parseHubId(rawMediaId);
  if (!mediaId) return res.status(400).json({ error: "Invalid media id." });

  // Unsave is intentionally owner-scoped rather than visibility-scoped. A
  // user's private save must remain removable after membership or moderation
  // changes make the underlying media unavailable to read.
  await db.delete(communityMediaSavesTable).where(and(
    eq(communityMediaSavesTable.user_id, req.authenticatedUserId!),
    eq(communityMediaSavesTable.media_id, mediaId),
  ));

  return res.json({ media_id: mediaId, saved: false, private: true });
});

router.post("/community/hubs/:hubId/posts/:postId/comments", requireAuth, communityPostLimiter, async (req, res) => {
  const hubId = parseHubId(Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId);
  const postId = parseHubId(Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId);
  if (!hubId || !postId) return res.status(400).json({ error: "Invalid Hub or post id." });
  const parsed = CreateCommunityCommentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Comment text must be between 1 and 2000 characters." });
  if (!(await isApprovedHubMember(req.authenticatedUserId!, hubId))) {
    return res.status(403).json({ error: "Approved Hub membership is required to comment." });
  }
  const [post] = await db.select({ id: hubCommunityPostsTable.id })
    .from(hubCommunityPostsTable)
    .where(and(
      eq(hubCommunityPostsTable.id, postId),
      eq(hubCommunityPostsTable.hub_id, hubId),
      eq(hubCommunityPostsTable.moderation_status, "approved"),
    ))
    .limit(1);
  if (!post) return res.status(404).json({ error: "Community post not found." });
  const moderation = moderatePostText(parsed.data.body);
  const [comment] = await db.insert(hubCommunityPostCommentsTable).values({
    post_id: postId,
    author_id: req.authenticatedUserId!,
    body: parsed.data.body,
    moderation_status: moderation.status,
    moderation_reason: moderation.reason,
  }).returning();
  if (!comment) return res.status(500).json({ error: "Comment could not be saved." });
  if (comment.moderation_status === "approved") {
    void broadcast({
      type: "hub_community_post_updated",
      payload: { hub_id: hubId, post_id: postId, change: "comment" },
    });
  }
  return res.status(201).json({ comment });
});

router.post("/community/hubs/:hubId/posts/:postId/reactions", requireAuth, communityLikeLimiter, async (req, res) => {
  const hubId = parseHubId(Array.isArray(req.params.hubId) ? req.params.hubId[0] : req.params.hubId);
  const postId = parseHubId(Array.isArray(req.params.postId) ? req.params.postId[0] : req.params.postId);
  if (!hubId || !postId) return res.status(400).json({ error: "Invalid Hub or post id." });
  const parsed = CommunityReactionBody.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid reaction." });
  if (!(await isApprovedHubMember(req.authenticatedUserId!, hubId))) {
    return res.status(403).json({ error: "Approved Hub membership is required to react." });
  }
  const [post] = await db.select({ id: hubCommunityPostsTable.id })
    .from(hubCommunityPostsTable)
    .where(and(eq(hubCommunityPostsTable.id, postId), eq(hubCommunityPostsTable.hub_id, hubId), eq(hubCommunityPostsTable.moderation_status, "approved")))
    .limit(1);
  if (!post) return res.status(404).json({ error: "Community post not found." });
  const existing = await db.select({ id: hubCommunityPostReactionsTable.id })
    .from(hubCommunityPostReactionsTable)
    .where(and(
      eq(hubCommunityPostReactionsTable.post_id, postId),
      eq(hubCommunityPostReactionsTable.user_id, req.authenticatedUserId!),
      eq(hubCommunityPostReactionsTable.reaction, parsed.data.reaction),
    ))
    .limit(1);
  if (existing[0]) {
    await db.delete(hubCommunityPostReactionsTable).where(eq(hubCommunityPostReactionsTable.id, existing[0].id));
  } else {
    await db.insert(hubCommunityPostReactionsTable).values({
      post_id: postId,
      user_id: req.authenticatedUserId!,
      reaction: parsed.data.reaction,
    }).onConflictDoNothing();
  }
  const [count] = await db.select({ count: sql<number>`count(*)::int` })
    .from(hubCommunityPostReactionsTable)
    .where(eq(hubCommunityPostReactionsTable.post_id, postId));
  void broadcast({
    type: "hub_community_post_updated",
    payload: {
      hub_id: hubId,
      post_id: postId,
      change: "reaction",
      reaction: parsed.data.reaction,
      reaction_count: Number(count?.count ?? 0),
    },
  });
  return res.json({ post_id: postId, reaction: parsed.data.reaction, reaction_count: Number(count?.count ?? 0), reacted: !existing[0] });
});

export default router;
