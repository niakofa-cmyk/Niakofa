import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export async function saveConversation(
  userId: number | null,
  sessionId: string,
  userMessage: string,
  niaResponse: string
) {
  await pool.query(
    `INSERT INTO nia_conversations (user_id, session_id, user_message, nia_response, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, sessionId, userMessage, niaResponse]
  );
}

export async function getRecentHistory(
  sessionId: string,
  limit = 10
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const result = await pool.query(
    `SELECT user_message, nia_response FROM nia_conversations
     WHERE session_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at ASC LIMIT $2`,
    [sessionId, limit]
  );
  const history: { role: "user" | "assistant"; content: string }[] = [];
  for (const row of result.rows) {
    history.push({ role: "user", content: row.user_message });
    history.push({ role: "assistant", content: row.nia_response });
  }
  return history;
}

export async function getScrollbackHistory(sessionId: string) {
  const result = await pool.query(
    `SELECT user_message, nia_response, created_at FROM nia_conversations
     WHERE session_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows.map((r) => ({
    userMessage: r.user_message,
    niaResponse: r.nia_response,
    createdAt: r.created_at,
  }));
}

export async function purgeExpiredConversations() {
  await pool.query(`DELETE FROM nia_conversations WHERE created_at < NOW() - INTERVAL '24 hours'`);
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
// 20 messages per user per day — resets at midnight UTC
export async function checkRateLimit(
  userId: number | null,
  sessionId: string
): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const key = userId ? `user:${userId}` : `session:${sessionId}`;
  const isUser = !!userId;

  const result = await pool.query(
    `SELECT COUNT(*) as count FROM nia_conversations
     WHERE ${isUser ? "user_id = $1" : "session_id = $1"}
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [isUser ? userId : sessionId]
  );

  const count = parseInt(result.rows[0].count, 10);
  const limit = isUser ? 20 : 10; // logged-in users get 20/day, guests get 10/day
  const remaining = Math.max(0, limit - count);
  const resetAt = new Date();
  resetAt.setUTCHours(24, 0, 0, 0);

  return {
    allowed: count < limit,
    remaining,
    resetAt: resetAt.toISOString(),
  };
}
