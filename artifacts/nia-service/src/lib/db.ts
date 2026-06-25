import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pino } from "pino";

const logger = pino({ level: "info" });
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // BUG-4-L04: statement_timeout prevents runaway/deadlocked queries from
  // hanging the Nia chat handler indefinitely.
  statement_timeout: 10_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "nia: pg pool error");
});

// BUG-4-H09: SIGTERM handler must await pool.end() so active queries finish
// cleanly before process exit. Previously process.exit(0) was called without
// draining the pool, which could corrupt in-progress Nia conversations during
// Railway rolling deploys.
process.on("SIGTERM", async () => {
  logger.info("nia: SIGTERM received — draining pool before exit");
  try {
    await pool.end();
    logger.info("nia: pool drained — exiting cleanly");
  } catch (err) {
    logger.error({ err }, "nia: pool.end() failed during SIGTERM");
  }
  process.exit(0);
});

export async function runMigrations(): Promise<void> {
  const sqlPath = path.join(__dirname, "..", "..", "migrate.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  await pool.query(sql);
  logger.info("nia: migrations applied (nia_conversations, nia_memories)");
}

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
    [
      userId,
      sessionId,
      truncateForStorage(userMessage),
      truncateForStorage(niaResponse),
    ]
  );
}

/**
 * Save a check-in conversation initiated by the scheduler.
 * The request_id is stored so we can later look up the context.
 */
export async function saveCheckinConversation(
  userId: number,
  sessionId: string,
  openingPrompt: string,
  niaResponse: string,
  requestId: number | null
) {
  await pool.query(
    `INSERT INTO nia_conversations (user_id, session_id, user_message, nia_response, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [
      userId,
      sessionId,
      truncateForStorage(`[check-in:${requestId ?? "?"}] ${openingPrompt}`),
      truncateForStorage(niaResponse),
    ]
  );
}

export async function getRecentHistory(
  sessionId: string,
  limit = 12
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const result = await pool.query(
    `SELECT user_message, nia_response FROM nia_conversations
     WHERE session_id = $1 AND created_at > NOW() - INTERVAL '48 hours'
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

// BUG-21: Accept userId so we can verify the session belongs to the requesting user.
// If a userId is provided, the query additionally filters by user_id so that
// guessable session IDs cannot expose another user's conversation history.
export async function getScrollbackHistory(sessionId: string, userId?: number) {
  const params: (string | number)[] = [sessionId];
  let query = `SELECT user_message, nia_response, created_at FROM nia_conversations
     WHERE session_id = $1 AND created_at > NOW() - INTERVAL '48 hours'`;
  if (userId !== undefined) {
    params.push(userId);
    query += ` AND user_id = $${params.length}`;
  }
  query += ` ORDER BY created_at ASC`;
  const result = await pool.query(query, params);
  return result.rows.map((r) => ({
    userMessage: r.user_message,
    niaResponse: r.nia_response,
    createdAt: r.created_at,
  }));
}

export interface ActiveRequestInfo {
  id: number;
  title: string;
  description: string | null;
  category: string;
  urgency: string;
  status: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  createdAt: Date;
  viewerRole: "requester" | "helper";
}

export async function getActiveRequest(
  requestId: number,
  userId: number | null
): Promise<ActiveRequestInfo | null> {
  if (!userId) return null;
  const result = await pool.query(
    `SELECT id, title, description, category, urgency, status, neighborhood, lat, lng, created_at, requester_id, helper_id
     FROM help_requests
     WHERE id = $1 AND (requester_id = $2 OR helper_id = $2)
     LIMIT 1`,
    [requestId, userId]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    urgency: r.urgency,
    status: r.status,
    neighborhood: r.neighborhood,
    lat: r.lat,
    lng: r.lng,
    createdAt: r.created_at,
    viewerRole: r.requester_id === userId ? "requester" : "helper",
  };
}

export async function purgeExpiredConversations() {
  // Keep 48 hours — users returning the next day should still see their conversation.
  // The nia_memories table holds the long-term, distilled memory; the conversation
  // log is ephemeral context for continuity across a session or overnight.
  await pool.query(
    `DELETE FROM nia_conversations WHERE created_at < NOW() - INTERVAL '48 hours'`
  );
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
  // Authenticated users: 50 messages/day — generous enough for genuine need,
  // including crisis support conversations that run long.
  // Anonymous sessions: 20 messages/day — enough to help, enough to prompt sign-up.
  const limit = isUser ? 50 : 20;
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
  const get = (type: string) =>
    Number(dateParts.find((p) => p.type === type)?.value);
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
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return (asUtc - date.getTime()) / 60_000;
}

export async function getUserMemory(userId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT memory FROM nia_memories WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.memory ?? null;
}

export async function upsertUserMemory(
  userId: number,
  memory: string
): Promise<void> {
  await pool.query(
    `INSERT INTO nia_memories (user_id, memory, created_at, updated_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET memory = $2, updated_at = NOW()`,
    [userId, memory]
  );
}

/**
 * Find completed help requests eligible for a 24-hour Nia follow-up check-in.
 *
 * Eligible means:
 *   - status = 'completed'
 *   - completed_at is between 23 and 25 hours ago (2-hour window avoids double-fire
 *     if the hourly worker runs slightly off-schedule)
 *   - No nia_conversations checkin row already exists for this request + requester pair
 *     (detected by the "[check-in:<id>]" prefix we write in saveCheckinConversation)
 *
 * Queries the main app DB (same DATABASE_URL) — nia-service has access to both
 * the help_requests / users tables and its own nia_conversations table via the
 * shared pool.
 */
export async function getCompletedRequestsForCheckin(): Promise<
  {
    id: number;
    title: string;
    category: string;
    requester_id: number;
    helper_name: string | null;
  }[]
> {
  const result = await pool.query(`
    SELECT
      hr.id,
      hr.title,
      hr.category,
      hr.requester_id,
      u.name AS helper_name
    FROM help_requests hr
    LEFT JOIN users u ON u.id = hr.helper_id
    WHERE hr.status = 'completed'
      AND hr.completed_at BETWEEN NOW() - INTERVAL '25 hours' AND NOW() - INTERVAL '23 hours'
      AND NOT EXISTS (
        SELECT 1 FROM nia_conversations nc
        WHERE nc.user_id = hr.requester_id
          AND nc.user_message LIKE '[check-in:' || hr.id || ']%'
      )
    LIMIT 20
  `);
  return result.rows as {
    id: number;
    title: string;
    category: string;
    requester_id: number;
    helper_name: string | null;
  }[];
}
