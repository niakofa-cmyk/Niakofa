import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAuth, requireApproved } from "../middlewares/auth";
const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get("/realtime/events", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const after = typeof req.query.after === "string" ? req.query.after.trim() : null;
  if (after && !UUID_RE.test(after)) {
    return res.status(400).json({ error: "The replay cursor must be a UUID." });
  }

  const parsedLimit = Number(req.query.limit ?? 100);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 100, 1), 250);
  const cursorRows = after
    ? await db.execute<{ occurred_at: string; event_id: string }>(
        sql`SELECT occurred_at,event_id FROM realtime_event_log WHERE event_id=${after}::uuid LIMIT 1`,
      )
    : { rows: [] as { occurred_at: string; event_id: string }[] };
  const cursor = cursorRows.rows[0];
  if (after && !cursor) {
    return res.status(410).json({ error: "The replay cursor is no longer available. Reconnect with a fresh cursor." });
  }
  const cursorClause = cursor
    ? sql`AND (occurred_at,event_id) > (${cursor.occurred_at}::timestamptz,${cursor.event_id}::uuid)`
    : sql``;
  const result = await db.execute(sql`
    SELECT event_id,event_type,occurred_at,actor_id,conversation_kind,conversation_id,entity_id,payload
    FROM realtime_event_log
    WHERE audience_user_ids @> ARRAY[${userId}]::integer[]
      ${cursorClause}
    ORDER BY occurred_at ASC,event_id ASC
    LIMIT ${limit + 1}
  `);
  const rows = result.rows;
  const events = rows.slice(0, limit);
  const nextCursor = events.at(-1)?.event_id ?? (cursor?.event_id ?? null);
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    events,
    next_cursor: nextCursor,
    has_more: rows.length > limit,
  });
});

export default router;