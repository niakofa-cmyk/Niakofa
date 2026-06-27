import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pino } from "pino";
import { CATEGORY_LABELS } from "../middleware/location.js";

const logger = pino({ level: "info" });
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 10_000,
});

pool.on("error", (err) => {
  logger.error({ err }, "nia: pg pool error");
});

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
  logger.info("nia: migrations applied (nia_conversations, nia_memories, structured column)");
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
  niaResponse: string,
  isCrisis: boolean = false
) {
  await pool.query(
    `INSERT INTO nia_conversations (user_id, session_id, user_message, nia_response, is_crisis, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      userId,
      sessionId,
      truncateForStorage(userMessage),
      truncateForStorage(niaResponse),
      isCrisis,
    ]
  );
}

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
  limit = 20
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
     FROM requests
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
  // Crisis-flagged rows must survive past 72h, or getCrisisConversationsForFollowup()
  // (which looks at the 48-72h window) would find nothing — every flagged row
  // would already be deleted by the time its follow-up window opened. Normal
  // conversations still purge at 48h as before.
  await pool.query(
    `DELETE FROM nia_conversations
     WHERE (is_crisis = FALSE AND created_at < NOW() - INTERVAL '48 hours')
        OR (is_crisis = TRUE  AND created_at < NOW() - INTERVAL '96 hours')`
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

// ── Structured memory (Phase 1) ───────────────────────────────────────────────

export interface StructuredMemory {
  recurring_needs: string[];
  accessibility_notes: string[];
  people_mentioned: { name: string; relation: string }[];
  corrections: string[];
  preferred_language?: string;
  emotional_arc?: "improving" | "stable" | "declining" | "unknown";
  resources_that_worked?: string[];
}

const EMPTY_STRUCTURED: StructuredMemory = {
  recurring_needs: [],
  accessibility_notes: [],
  people_mentioned: [],
  corrections: [],
};

export async function getStructuredMemory(userId: number): Promise<StructuredMemory> {
  const result = await pool.query(
    `SELECT structured FROM nia_memories WHERE user_id = $1`,
    [userId]
  );
  if (!result.rows[0]?.structured) return { ...EMPTY_STRUCTURED };
  return { ...EMPTY_STRUCTURED, ...(result.rows[0].structured as StructuredMemory) };
}

/**
 * Merge a partial structured memory patch into the existing JSONB.
 * Uses Postgres || operator to merge at the top level — arrays are replaced,
 * not appended (the caller is responsible for reading first, merging, then writing).
 */
export async function upsertStructuredMemory(
  userId: number,
  patch: Partial<StructuredMemory>
): Promise<void> {
  await pool.query(
    `INSERT INTO nia_memories (user_id, memory, structured, created_at, updated_at)
     VALUES ($1, '', $2::jsonb, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
     SET structured = nia_memories.structured || $2::jsonb,
         updated_at = NOW()`,
    [userId, JSON.stringify(patch)]
  );
}

export async function getFullMemory(userId: number): Promise<{ memory: string | null; structured: StructuredMemory }> {
  const result = await pool.query(
    `SELECT memory, structured FROM nia_memories WHERE user_id = $1`,
    [userId]
  );
  return {
    memory: result.rows[0]?.memory ?? null,
    structured: { ...EMPTY_STRUCTURED, ...(result.rows[0]?.structured ?? {}) },
  };
}

// ── Completed requests for check-in worker ───────────────────────────────────

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
      r.id,
      r.title,
      r.category,
      r.requester_id,
      u.name AS helper_name
    FROM requests hr
    LEFT JOIN users u ON u.id = r.helper_id
    WHERE r.status = 'completed'
      AND r.completed_at BETWEEN NOW() - INTERVAL '25 hours' AND NOW() - INTERVAL '23 hours'
      AND NOT EXISTS (
        SELECT 1 FROM nia_conversations nc
        WHERE nc.user_id = r.requester_id
          AND nc.user_message LIKE '[check-in:' || r.id || ']%'
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

// ── Crisis follow-up worker (Phase 2) ────────────────────────────────────────
//
// Finds users whose most recent crisis-flagged Nia conversation (48–72 hours
// ago) hasn't had any message since, and hasn't already had a crisis
// follow-up sent. Nia reaches out gently — not re-triggering distress, just
// letting them know she's still here.
//
// Uses the real `is_crisis` column (set by checkSafety() at save-time in
// routes/chat.ts, migration 0013) rather than text-matching nia_response for
// "988"/"741741"/"crisis" — that heuristic was fragile (e.g. would also match
// a user asking a purely informational question about crisis hotlines, and
// would miss any future wording change to safety.ts's escalation message).

export async function getCrisisConversationsForFollowup(): Promise<
  { user_id: number; session_id: string }[]
> {
  const result = await pool.query(`
    SELECT DISTINCT ON (nc1.user_id) nc1.user_id, nc1.session_id
    FROM nia_conversations nc1
    WHERE nc1.user_id IS NOT NULL
      AND nc1.is_crisis = TRUE
      AND nc1.created_at BETWEEN NOW() - INTERVAL '72 hours' AND NOW() - INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM nia_conversations nc2
        WHERE nc2.user_id = nc1.user_id
          AND nc2.created_at > nc1.created_at
      )
      AND NOT EXISTS (
        SELECT 1 FROM nia_conversations nc3
        WHERE nc3.user_id = nc1.user_id
          AND nc3.user_message LIKE '[crisis-followup:%]%'
      )
    ORDER BY nc1.user_id, nc1.created_at DESC
    LIMIT 10
  `);
  return result.rows as { user_id: number; session_id: string }[];
}

// Saves a crisis follow-up message, tagged so getCrisisConversationsForFollowup
// won't re-select this user until they have another crisis-flagged message.
export async function saveCrisisFollowupConversation(
  userId: number,
  sessionId: string,
  niaMessage: string
): Promise<void> {
  await pool.query(
    `INSERT INTO nia_conversations (user_id, session_id, user_message, nia_response, is_crisis, created_at)
     VALUES ($1, $2, $3, $4, FALSE, NOW())`,
    [userId, sessionId, `[crisis-followup:${Date.now()}] (automated gentle check-in)`, niaMessage]
  );
}

// ── Phase 5: self-correcting category phrasing ──────────────────────────────
//
// Originally scoped as needing a new events table — unnecessary on closer
// look, since help_requests already has category, title, created_at, and
// claimed_at for every request ever posted. Queries that directly instead of
// duplicating the data. Deliberately conservative: requires a minimum sample
// size before returning anything for a category/keyword — better to say
// nothing than to advise someone based on a handful of data points.

const PHRASING_MIN_SAMPLE_SIZE = 8;
const PHRASING_KEYWORDS = ["urgent", "asap", "today", "emergency", "please", "need help"];

interface PhrasingInsightsCache {
  insights: string[];
  computedAt: number;
}
let phrasingInsightsCache: PhrasingInsightsCache | null = null;
const PHRASING_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — these don't change quickly

async function computePhrasingInsights(): Promise<string[]> {
  const insights: string[] = [];

  const categoryResult = await pool.query(`
    SELECT
      category,
      AVG(EXTRACT(EPOCH FROM (claimed_at - created_at)) / 60.0) AS avg_minutes,
      COUNT(*) AS sample_size
    FROM requests
    WHERE claimed_at IS NOT NULL AND created_at > NOW() - INTERVAL '90 days'
    GROUP BY category
    HAVING COUNT(*) >= $1
    ORDER BY avg_minutes ASC
    LIMIT 1
  `, [PHRASING_MIN_SAMPLE_SIZE]);
  const fastest = categoryResult.rows[0];
  if (fastest) {
    const label = CATEGORY_LABELS[fastest.category] ?? fastest.category.replace(/_/g, " ");
    insights.push(
      `${label} requests get claimed fastest on average, in about ${Math.round(Number(fastest.avg_minutes) * 10) / 10} minutes (based on ${fastest.sample_size} recent requests).`
    );
  }

  const overallResult = await pool.query(`
    SELECT AVG(EXTRACT(EPOCH FROM (claimed_at - created_at)) / 60.0) AS avg_minutes
    FROM requests
    WHERE claimed_at IS NOT NULL AND created_at > NOW() - INTERVAL '90 days'
  `);
  const overallAvg = overallResult.rows[0]?.avg_minutes ? Number(overallResult.rows[0].avg_minutes) : null;

  if (overallAvg && overallAvg > 0) {
    for (const keyword of PHRASING_KEYWORDS) {
      const kwResult = await pool.query(
        `SELECT
           AVG(EXTRACT(EPOCH FROM (claimed_at - created_at)) / 60.0) AS avg_minutes,
           COUNT(*) AS sample_size
         FROM requests
         WHERE claimed_at IS NOT NULL
           AND created_at > NOW() - INTERVAL '90 days'
           AND title ILIKE $1`,
        [`%${keyword}%`]
      );
      const row = kwResult.rows[0];
      const sampleSize = Number(row?.sample_size ?? 0);
      if (sampleSize < PHRASING_MIN_SAMPLE_SIZE || !row?.avg_minutes) continue;
      const avgMinutes = Number(row.avg_minutes);
      const pctFaster = Math.round(((overallAvg - avgMinutes) / overallAvg) * 1000) / 10;
      if (pctFaster > 5) {
        insights.push(
          `Requests with "${keyword}" in the title get claimed about ${pctFaster}% faster than average (based on ${sampleSize} recent requests).`
        );
      }
      if (insights.length >= 3) break;
    }
  }

  return insights;
}

/**
 * Cached, real-data phrasing insights for Nia to reference when someone is
 * drafting or asking about a help request. Returns an empty array (never
 * fabricated content) if there isn't enough data yet.
 */
export async function getPhrasingInsights(): Promise<string[]> {
  const now = Date.now();
  if (phrasingInsightsCache && now - phrasingInsightsCache.computedAt < PHRASING_CACHE_TTL_MS) {
    return phrasingInsightsCache.insights;
  }
  try {
    const insights = await computePhrasingInsights();
    phrasingInsightsCache = { insights, computedAt: now };
    return insights;
  } catch (err) {
    logger.error({ err }, "nia: getPhrasingInsights failed");
    return phrasingInsightsCache?.insights ?? [];
  }
}

// ── Kill-switch: isNiaEnabled() ──────────────────────────────────────────────
// Reads system_settings.nia_enabled from DB with a 10-second in-process cache.
// Defense-in-depth backstop — the proxy already blocks disabled traffic.
let _niaCachedEnabled: boolean | null = null;
let _niaCacheTs = 0;
const NIA_CACHE_TTL_MS = 10_000;

// Called by /internal/flush-nia-cache to instantly expire the TTL
export function resetNiaCache(): void {
  _niaCacheTs = 0;
  _niaCachedEnabled = null;
}

export async function isNiaEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_niaCachedEnabled !== null && now - _niaCacheTs < NIA_CACHE_TTL_MS) {
    return _niaCachedEnabled;
  }
  try {
    const row = await pool.query<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'nia_enabled' LIMIT 1"
    );
    _niaCachedEnabled = row.rows.length === 0 || row.rows[0].value !== "false";
  } catch {
    _niaCachedEnabled = true; // fail open
  }
  _niaCacheTs = now;
  return _niaCachedEnabled;
}
