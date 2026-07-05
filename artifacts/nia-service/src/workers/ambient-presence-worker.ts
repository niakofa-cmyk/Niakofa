/**
 * Nia Ambient Presence Worker
 *
 * Runs every 4 hours. Scans for users who may need proactive support:
 *
 * 1. FOOD SIGNAL: users whose recent requests mention food/hunger but have
 *    not received a Nia food-resource follow-up in 24h.
 *
 * 2. RECURRING NEED: users who have posted the same category of request
 *    3+ times in 30 days — Nia suggests the recurring request feature.
 *
 * 3. SILENT USERS: users who were active 7-14 days ago but have gone quiet
 *    — Nia checks in warmly with no agenda.
 *
 * For each qualifying user, Nia saves a proactive message to nia_conversations.
 *
 * BUG-14a FIX: Previously imported { db } from "../lib/db" and { sql } from
 * "drizzle-orm" and { logger } from "../lib/logger" — none exist in nia-service
 * (raw pg, not Drizzle; no logger module). Rewrote to use the exported `pool`
 * from lib/db.ts directly and pino for logging.
 *
 * BUG-14b FIX: nia_conversations schema has (user_id, session_id, user_message,
 * nia_response, is_crisis, created_at) — NOT a (role, content) pattern.
 * Corrected all INSERTs.
 *
 * BUG-14c FIX: push_notification_queue table is now created in migrate.sql.
 * All push inserts remain try/catch — non-fatal if table is still missing.
 *
 * Also fixed: help_requests column is requester_id, NOT user_id.
 */
import { pino } from "pino";
import { pool, isNiaEnabled } from "../lib/db.js";

const logger = pino({ level: "info" });

const BATCH_SIZE = 30;
const AMBIENT_SESSION_PREFIX = "nia_ambient_";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ambientSessionId(userId: number, type: string): string {
  return `${AMBIENT_SESSION_PREFIX}${type}_${userId}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Save a proactive Nia message using the correct nia_conversations schema:
 *   (user_id, session_id, user_message, nia_response, is_crisis, created_at)
 * user_message = internal trigger tag
 * nia_response = the warm message Nia "sends"
 */
async function saveAmbientMessage(
  userId: number,
  trigger: string,
  niaMessage: string,
  sessionType: string
): Promise<void> {
  const sessionId = ambientSessionId(userId, sessionType);
  await pool.query(
    `INSERT INTO nia_conversations
       (user_id, session_id, user_message, nia_response, is_crisis, created_at)
     VALUES ($1, $2, $3, $4, FALSE, NOW())`,
    [userId, sessionId, truncate(trigger, 500), truncate(niaMessage, 3000)]
  );
}

/**
 * Try to insert into push_notification_queue — non-fatal if table doesn't exist yet.
 */
async function queuePush(
  userId: number,
  title: string,
  body: string,
  data: object
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO push_notification_queue (user_id, title, body, data, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [userId, title, body, JSON.stringify(data)]
    );
  } catch {
    // Table may not exist yet — non-fatal, ambient messages are still saved
  }
}

// ─── 1. Food signal check-in ──────────────────────────────────────────────────

async function processFoodSignals(): Promise<number> {
  const result = await pool.query(
    `SELECT DISTINCT
       hr.requester_id AS user_id,
       u.name          AS user_name,
       MAX(hr.created_at) AS last_food_request
     FROM help_requests hr
     JOIN users u ON u.id = hr.requester_id
     WHERE (
       hr.category IN ('groceries', 'food_pantry')
       OR LOWER(hr.title) LIKE ANY(ARRAY['%food%','%groceries%','%hungry%','%meal%','%hunger%'])
     )
       AND hr.created_at >= NOW() - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM nia_conversations nc
         WHERE nc.user_id = hr.requester_id
           AND nc.nia_response ILIKE '%food%'
           AND nc.created_at >= NOW() - INTERVAL '24 hours'
       )
     GROUP BY hr.requester_id, u.name
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let count = 0;
  for (const row of result.rows as Array<{ user_id: number; user_name: string }>) {
    try {
      const firstName = row.user_name?.split(" ")[0] ?? "friend";
      const niaMessage = [
        `Hey ${firstName} 💙`,
        ``,
        `I noticed you've been looking for food help recently. I just wanted to check in — do you need help finding food resources today?`,
        ``,
        `You can text or call 211 to find same-day food assistance near you. In Tarrant County: Tarrant Area Food Bank 817-857-7100.`,
        `I'm here if you need anything.`,
      ].join("\n");

      await saveAmbientMessage(row.user_id, "[ambient:food_signal]", niaMessage, "food");
      await queuePush(
        row.user_id,
        "💙 Nia is thinking of you",
        `Hey ${firstName}, I noticed you might need food help. Tap to chat.`,
        { type: "ambient_food_checkin", notifType: "nia_checkin", user_id: row.user_id }
      );
      count++;
      logger.info({ userId: row.user_id }, "ambient-presence: food signal check-in sent");
    } catch (err) {
      logger.error({ err, userId: row.user_id }, "ambient-presence: food user error");
    }
  }
  return count;
}

// ─── 2. Recurring need detection ─────────────────────────────────────────────

async function processRecurringNeeds(): Promise<number> {
  const result = await pool.query(
    `SELECT
       hr.requester_id AS user_id,
       u.name          AS user_name,
       hr.category,
       COUNT(*)        AS request_count
     FROM help_requests hr
     JOIN users u ON u.id = hr.requester_id
     WHERE hr.created_at >= NOW() - INTERVAL '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM nia_conversations nc
         WHERE nc.user_id = hr.requester_id
           AND nc.nia_response ILIKE '%recurring%'
           AND nc.created_at >= NOW() - INTERVAL '7 days'
       )
     GROUP BY hr.requester_id, u.name, hr.category
     HAVING COUNT(*) >= 3
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let count = 0;
  for (const row of result.rows as Array<{
    user_id: number; user_name: string; category: string; request_count: number;
  }>) {
    try {
      const firstName = row.user_name?.split(" ")[0] ?? "friend";
      const categoryLabel = row.category?.replace(/_/g, " ") ?? "help";
      const niaMessage = [
        `Hey ${firstName} 💙`,
        ``,
        `I noticed you've been posting ${categoryLabel} requests pretty regularly — ${row.request_count} times in the last month.`,
        ``,
        `Did you know Niakofa has a recurring request feature? Instead of posting from scratch each time, you can set up a standing request and neighbors can sign up to help on a schedule.`,
        ``,
        `Just go to + New Request and look for the 'Recurring' option. Might save you some time. 💙`,
      ].join("\n");

      await saveAmbientMessage(row.user_id, "[ambient:recurring_need]", niaMessage, "recurring");
      count++;
      logger.info(
        { userId: row.user_id, category: row.category },
        "ambient-presence: recurring need tip sent"
      );
    } catch (err) {
      logger.error({ err, userId: row.user_id }, "ambient-presence: recurring user error");
    }
  }
  return count;
}

// ─── 3. Silent user warm check-in ────────────────────────────────────────────

async function processSilentUsers(): Promise<number> {
  const result = await pool.query(
    `SELECT
       u.id        AS user_id,
       u.name      AS user_name,
       MAX(hr.created_at) AS last_activity
     FROM users u
     JOIN help_requests hr ON hr.requester_id = u.id
     WHERE hr.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM nia_conversations nc
         WHERE nc.user_id = u.id
           AND nc.created_at >= NOW() - INTERVAL '7 days'
       )
       AND NOT EXISTS (
         SELECT 1 FROM nia_conversations nc2
         WHERE nc2.user_id = u.id
           AND nc2.nia_response ILIKE '%checking in%'
           AND nc2.created_at >= NOW() - INTERVAL '14 days'
       )
     GROUP BY u.id, u.name
     LIMIT $1`,
    [BATCH_SIZE]
  );

  let count = 0;
  for (const row of result.rows as Array<{ user_id: number; user_name: string }>) {
    try {
      const firstName = row.user_name?.split(" ")[0] ?? "friend";
      const niaMessage = [
        `Hey ${firstName} 💙`,
        ``,
        `Just checking in — I haven't seen you around in a bit. How are you doing?`,
        ``,
        `I'm here whenever you need anything. No rush. Just wanted you to know.`,
      ].join("\n");

      await saveAmbientMessage(row.user_id, "[ambient:silent_user]", niaMessage, "silent");
      await queuePush(
        row.user_id,
        "💙 Nia is thinking of you",
        `Hey ${firstName}, just checking in. Tap to chat whenever you're ready.`,
        { type: "ambient_silent_checkin", notifType: "nia_checkin", user_id: row.user_id }
      );
      count++;
      logger.info({ userId: row.user_id }, "ambient-presence: silent user warm check-in sent");
    } catch (err) {
      logger.error({ err, userId: row.user_id }, "ambient-presence: silent user error");
    }
  }
  return count;
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runAmbientPresence(): Promise<void> {
  // Kill-switch: skip the entire cycle when Nia is disabled by admin.
  // Without this gate, proactive pushes ("💙 Nia checked in on you") and
  // Anthropic spend continue even while the toggle is off. Fail-closed: a
  // broken DB read also resolves to false, so any uncertainty means silence.
  if (!(await isNiaEnabled())) {
    logger.info("ambient-presence-worker: Nia is disabled — skipping cycle");
    return;
  }

  logger.info("ambient-presence-worker: starting cycle");
  let total = 0;

  try { total += await processFoodSignals(); }
  catch (err) { logger.error({ err }, "ambient-presence: food signal scan failed"); }

  try { total += await processRecurringNeeds(); }
  catch (err) { logger.error({ err }, "ambient-presence: recurring scan failed"); }

  try { total += await processSilentUsers(); }
  catch (err) { logger.error({ err }, "ambient-presence: silent user scan failed"); }

  logger.info({ totalProcessed: total }, "ambient-presence-worker: cycle complete");
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function startAmbientPresenceWorker(): Promise<void> {
  logger.info("ambient-presence-worker: starting");

  // Stagger startup by 10 minutes to avoid thundering herd with other workers
  setTimeout(async () => {
    try { await runAmbientPresence(); }
    catch (err) { logger.error({ err }, "ambient-presence-worker: startup run failed"); }

    // Then every 4 hours
    setInterval(async () => {
      try { await runAmbientPresence(); }
      catch (err) { logger.error({ err }, "ambient-presence-worker: interval run failed"); }
    }, 4 * 60 * 60 * 1000);
  }, 10 * 60 * 1000);
}
