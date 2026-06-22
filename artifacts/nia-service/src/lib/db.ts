import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("nia: unexpected pg pool error", err);
});

const MAX_STORED_CHARS = 8000;

function truncateForStorage(text: string): string {
  if (text.length <= MAX_STORED_CHARS) return text;
  return text.slice(0, MAX_STORED_CHARS) + "\u2026 [truncated for storage]";
}

export async function saveConversation(
  userId: number | null,
  sessionId: string,
  userMessage: string,
  niaResponse: string
) {
  await pool.query(
    `INSERT INTO nia_conversations (user_id, session_id, user_message, nia_response, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, sessionId, truncateForStorage(userMessage), truncateForStorage(niaResponse)]
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

export async function checkRateLimit(
  userId: number | null,
  sessionId: string | string[],
  timezone?: string
): Promise<{ allowed: boolean; remaining: number; resetAt: string }> {
  const sid = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const isUser = !!userId;

  const result = await pool.query(
    `SELECT COUNT(*) as count FROM nia_conversations
     WHERE ${isUser ? "user_id = $1" : "session_id = $1"}
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [isUser ? userId : sid]
  );

  const count = parseInt(result.rows[0].count, 10);
  const limit = isUser ? 20 : 10;
  const remaining = Math.max(0, limit - count);

  return {
    allowed: count < limit,
    remaining,
    resetAt: nextLocalMidnight(timezone).toISOString(),
  };
}

function nextLocalMidnight(timezone?: string): Date {
  const tz = timezone || "UTC";
  const now = new Date();

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(dateParts.find((p) => p.type === type)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");

  const offsetMinutes = getTimezoneOffsetMinutes(tz, now);

  return new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - offsetMinutes * 60_000);
}

function getTimezoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour"), get("minute"), get("second")
  );
  return (asUtc - date.getTime()) / 60_000;
}
