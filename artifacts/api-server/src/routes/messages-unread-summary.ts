import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();

/**
 * Authoritative unread summary for the unified Messages inbox.
 *
 * Direct keeps its existing message-level read_at semantics. Request and Hub
 * use message_read_states cursors so unread state survives refreshes, tabs,
 * reconnects, and devices without pretending that a conversation has only
 * one reader.
 */
router.get("/messages/unread-summary", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;

  const directResult = await db.execute<{ c: number | string }>(sql`
    SELECT COUNT(DISTINCT m.conversation_id)::int AS c
    FROM direct_messages m
    INNER JOIN direct_conversation_members members
      ON members.conversation_id = m.conversation_id
     AND members.user_id = ${userId}
    INNER JOIN direct_conversations c
      ON c.id = m.conversation_id
     AND c.status = 'active'
    WHERE m.sender_id <> ${userId}
      AND m.read_at IS NULL
  `);

  const requestResult = await db.execute<{ c: number | string }>(sql`
    SELECT COUNT(DISTINCT m.request_id)::int AS c
    FROM chat_messages m
    INNER JOIN help_requests r ON r.id = m.request_id
    LEFT JOIN message_read_states rs
      ON rs.user_id = ${userId}
     AND rs.conversation_kind = 'request'
     AND rs.conversation_id = m.request_id
    WHERE (r.requester_id = ${userId} OR r.helper_id = ${userId})
      AND m.sender_id <> ${userId}
      AND m.id > COALESCE(rs.last_read_message_id, 0)
  `);

  const hubResult = await db.execute<{ c: number | string }>(sql`
    SELECT COUNT(DISTINCT m.conversation_id)::int AS c
    FROM diaspora_hub_messages m
    INNER JOIN diaspora_hub_conversations c
      ON c.id = m.conversation_id
    LEFT JOIN message_read_states rs
      ON rs.user_id = ${userId}
     AND rs.conversation_kind = 'hub'
     AND rs.conversation_id = m.conversation_id
    WHERE m.sender_user_id <> ${userId}
      AND m.id > COALESCE(rs.last_read_message_id, 0)
      AND EXISTS (
        SELECT 1
        FROM hub_memberships hm
        WHERE hm.user_id = ${userId}
          AND hm.hub_id IN (c.hub_a_id, c.hub_b_id)
          AND COALESCE(hm.status, 'active') = 'active'
      )
  `);

  const direct = Number(directResult.rows[0]?.c ?? 0);
  const requests = Number(requestResult.rows[0]?.c ?? 0);
  const hubs = Number(hubResult.rows[0]?.c ?? 0);

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    all: direct + requests + hubs,
    direct,
    requests,
    hubs,
    derived: false,
  });
});

export default router;
