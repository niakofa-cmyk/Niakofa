import { Router } from "express";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  db,
  messageNotificationsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter, adminLimiter } from "../middlewares/rate-limit";
import { requireAdmin } from "../middlewares/authz";
import { getPresence, isUserOnline } from "../lib/ws-hub";
import { messageActivityEventsTable } from "@workspace/db";

const router = Router();
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

router.get("/messages/activity-evidence", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const rows = await db
    .select({
      event_type: messageActivityEventsTable.event_type,
      count: sql<number>`count(*)::int`,
    })
    .from(messageActivityEventsTable)
    .where(sql`${messageActivityEventsTable.created_at} >= now() - interval '30 days'`)
    .groupBy(messageActivityEventsTable.event_type)
    .orderBy(desc(sql`count(*)`));

  const recent = await db
    .select({
      id: messageActivityEventsTable.id,
      user_id: messageActivityEventsTable.user_id,
      event_type: messageActivityEventsTable.event_type,
      entity_type: messageActivityEventsTable.entity_type,
      entity_id: messageActivityEventsTable.entity_id,
      metadata: messageActivityEventsTable.metadata,
      created_at: messageActivityEventsTable.created_at,
    })
    .from(messageActivityEventsTable)
    .orderBy(desc(messageActivityEventsTable.created_at))
    .limit(100);

  return res.json({
    window_days: 30,
    counts: rows.map((row) => ({ event_type: row.event_type, count: Number(row.count ?? 0) })),
    recent: recent.map((row) => ({
      ...row,
      created_at: row.created_at.toISOString(),
    })),
  });
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
