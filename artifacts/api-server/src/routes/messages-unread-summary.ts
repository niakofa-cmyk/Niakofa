import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";

const router = Router();

/**
 * Counts unread Direct conversations using the same read_at semantics as the
 * Direct inbox. Requests and Hubs intentionally remain zero until those
 * products have durable per-user read state.
 *
 * This endpoint must use requireApproved: unread badges expose account-scoped
 * messaging state and should honor token revocation and approval boundaries.
 */
router.get("/messages/unread-summary", requireAuth, requireApproved, generalApiLimiter, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const result = await db.execute<{ c: number | string }>(sql`
    SELECT COUNT(DISTINCT message_rows.conversation_id)::int AS c
    FROM direct_messages AS message_rows
    INNER JOIN direct_conversation_members AS members
      ON members.conversation_id = message_rows.conversation_id
     AND members.user_id = ${userId}
    INNER JOIN direct_conversations AS conversations
      ON conversations.id = message_rows.conversation_id
     AND conversations.status = 'active'
    WHERE message_rows.sender_id <> ${userId}
      AND message_rows.read_at IS NULL
  `);
  const direct = Number(result.rows[0]?.c ?? 0);
  const requests = 0;
  const hubs = 0;

  res.setHeader("Cache-Control", "no-store");
  return res.json({
    all: direct + requests + hubs,
    direct,
    requests,
    hubs,
    derived: true,
    note: "Request and Hub unread counts require durable per-user read state.",
  });
});

export default router;