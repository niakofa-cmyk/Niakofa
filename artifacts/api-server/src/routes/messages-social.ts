import { Router } from "express";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  db,
  messageNotificationsTable,
  messageStoriesTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import { getPresence, isUserOnline } from "../lib/ws-hub";

const router = Router();
const MAX_STORY_BODY = 1_000;

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function serializeDate(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// GET /api/messages/people — approved People directory with ground-truth WS presence.
router.get("/messages/people", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const query = cleanText(req.query.q, 100);
  const pattern = query ? `%${query.replace(/[%_]/g, "\\$&")}%` : null;

  const candidates = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
      city: usersTable.city,
      neighborhood: usersTable.neighborhood,
      helper_mode_active: usersTable.helper_mode_active,
      helper_status: usersTable.helper_status,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      sql`${usersTable.id} <> ${userId}`,
      ...(pattern ? [or(ilike(usersTable.name, pattern), ilike(usersTable.email, pattern))] : []),
    ))
    .orderBy(asc(usersTable.name))
    .limit(100);

  const people = candidates
    .map((person) => ({
      ...person,
      active_now: isUserOnline(person.id),
      presence: getPresence(person.id),
    }))
    .sort((a, b) => Number(b.active_now) - Number(a.active_now) || a.name.localeCompare(b.name));

  return res.json({ people });
});

// GET /api/messages/stories — durable, expiring user Stories, never inferred from conversation avatars.
router.get("/messages/stories", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const now = new Date();

  const rows = await db
    .select({
      story_id: messageStoriesTable.id,
      user_id: messageStoriesTable.user_id,
      body: messageStoriesTable.body,
      media_url: messageStoriesTable.media_url,
      media_type: messageStoriesTable.media_type,
      created_at: messageStoriesTable.created_at,
      expires_at: messageStoriesTable.expires_at,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
    })
    .from(messageStoriesTable)
    .innerJoin(usersTable, eq(usersTable.id, messageStoriesTable.user_id))
    .where(and(
      eq(messageStoriesTable.status, "published"),
      sql`${messageStoriesTable.expires_at} > ${now}`,
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
    ))
    .orderBy(desc(messageStoriesTable.created_at))
    .limit(200);

  const groups = new Map<number, {
    user_id: number;
    name: string;
    avatar_url: string | null;
    active_now: boolean;
    stories: Array<Record<string, unknown>>;
  }>();

  for (const row of rows) {
    const existing = groups.get(row.user_id) ?? {
      user_id: row.user_id,
      name: row.name,
      avatar_url: row.avatar_url,
      active_now: isUserOnline(row.user_id),
      stories: [],
    };
    existing.stories.push({
      id: row.story_id,
      body: row.body,
      media_url: row.media_url,
      media_type: row.media_type,
      created_at: serializeDate(row.created_at),
      expires_at: serializeDate(row.expires_at),
    });
    groups.set(row.user_id, existing);
  }

  return res.json({
    viewer_user_id: userId,
    people: Array.from(groups.values()).sort((a, b) => Number(b.active_now) - Number(a.active_now) || a.name.localeCompare(b.name)),
  });
});

router.post("/messages/stories", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const body = cleanText(req.body?.body, MAX_STORY_BODY);
  const mediaUrl = safeMediaUrl(req.body?.mediaUrl);
  const mediaType = cleanText(req.body?.mediaType, 80) || null;

  if (!body && !mediaUrl) {
    return res.status(400).json({ error: "A Story needs text or an HTTPS media URL." });
  }
  if (req.body?.mediaUrl && !mediaUrl) {
    return res.status(400).json({ error: "Story media must use HTTPS." });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const [story] = await db.insert(messageStoriesTable).values({
    user_id: userId,
    body: body || null,
    media_url: mediaUrl,
    media_type: mediaType,
    status: "published",
    expires_at: expiresAt,
  }).returning();

  return res.status(201).json({
    story: {
      id: story.id,
      body: story.body,
      media_url: story.media_url,
      media_type: story.media_type,
      created_at: serializeDate(story.created_at),
      expires_at: serializeDate(story.expires_at),
    },
  });
});

router.delete("/messages/stories/:id", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });

  const deleted = await db.delete(messageStoriesTable).where(and(
    eq(messageStoriesTable.id, storyId),
    eq(messageStoriesTable.user_id, userId),
  )).returning({ id: messageStoriesTable.id });

  return res.json({ deleted: deleted.length > 0 });
});

router.get("/messages/notifications", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const rows = await db
    .select()
    .from(messageNotificationsTable)
    .where(eq(messageNotificationsTable.user_id, userId))
    .orderBy(desc(messageNotificationsTable.created_at))
    .limit(50);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messageNotificationsTable)
    .where(and(eq(messageNotificationsTable.user_id, userId), isNull(messageNotificationsTable.read_at)));

  return res.json({
    unread_count: Number(count ?? 0),
    notifications: rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      title: row.title,
      body: row.body,
      actionUrl: row.action_url,
      actor_user_id: row.actor_user_id,
      metadata: row.metadata,
      time: serializeDate(row.created_at),
      read_at: serializeDate(row.read_at),
    })),
  });
});

router.post("/messages/notifications/:id/read", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid notification id." });
  await db.update(messageNotificationsTable)
    .set({ read_at: new Date() })
    .where(and(eq(messageNotificationsTable.id, id), eq(messageNotificationsTable.user_id, userId)));
  return res.json({ ok: true });
});

router.post("/messages/notifications/read-all", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  await db.update(messageNotificationsTable)
    .set({ read_at: new Date() })
    .where(and(eq(messageNotificationsTable.user_id, userId), isNull(messageNotificationsTable.read_at)));
  return res.json({ ok: true });
});

export default router;
