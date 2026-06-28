import { db } from "../lib/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

/**
 * Ambient Presence Worker — Nia notices things and proactively reaches out.
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
 * For each qualifying user, Nia:
 *  1. Saves a proactive message to nia_conversations
 *  2. Queues a push notification: "💙 Nia is thinking of you"
 *
 * This is what makes Nia feel alive — she watches, not just responds.
 */

const BATCH_SIZE = 30;
const FOOD_KEYWORDS = ['food', 'groceries', 'hungry', 'eat', 'meal', 'hunger',
  'pantry', 'fridge', 'grocery', 'snack', 'dinner', 'lunch', 'breakfast'];

async function runAmbientPresence(): Promise<void> {
  logger.info('ambient-presence-worker: starting cycle');
  let totalProcessed = 0;

  // ── 1. FOOD SIGNAL DETECTION ────────────────────────────────────────────
  // Find users with food-category requests in last 7 days
  // where no ambient food check-in has been sent in last 24h
  try {
    const foodRows = await db.execute(sql`
      SELECT DISTINCT
        hr.user_id,
        u.name AS user_name,
        MAX(hr.created_at) AS last_food_request
      FROM help_requests hr
      JOIN users u ON u.id = hr.user_id
      WHERE (
        hr.category = 'food'
        OR LOWER(hr.title) LIKE ANY(ARRAY['%food%', '%groceries%', '%hungry%', '%meal%', '%hunger%'])
      )
        AND hr.created_at >= NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM nia_conversations nc
          WHERE nc.user_id = hr.user_id
            AND nc.role = 'assistant'
            AND LOWER(nc.content) LIKE '%food%'
            AND nc.created_at >= NOW() - INTERVAL '24 hours'
        )
      GROUP BY hr.user_id, u.name
      LIMIT ${BATCH_SIZE}
    `);

    const foodUsers = (foodRows.rows ?? foodRows as any[]) as Array<{
      user_id: number;
      user_name: string;
      last_food_request: Date;
    }>;

    for (const user of foodUsers) {
      try {
        const firstName = user.user_name?.split(' ')[0] ?? 'friend';
        const niaMessage = [
          `Hey ${firstName} 💙`,
          ``,
          `I noticed you've been looking for food help recently. I just wanted to check in — do you need help finding food resources today?`,
          ``,
          `Tarrant Area Food Bank: 817-857-7100 | Text 211 for same-day food by zip code.`,
          `I'm here if you need anything.`,
        ].join('\n');

        // Save to nia_conversations
        try {
          await db.execute(sql`
            INSERT INTO nia_conversations (user_id, role, content, created_at)
            VALUES (${user.user_id}, 'assistant', ${niaMessage}, NOW())
          `);
        } catch (convErr) {
          logger.warn({ convErr, userId: user.user_id }, 'ambient-presence: could not save conversation');
        }

        // Queue push notification
        try {
          await db.execute(sql`
            INSERT INTO push_notification_queue (user_id, title, body, data, created_at)
            VALUES (
              ${user.user_id},
              '💙 Nia is thinking of you',
              ${`Hey ${firstName}, I noticed you might need food help. Tap to chat.`},
              ${JSON.stringify({ type: 'ambient_food_checkin', user_id: user.user_id })}::jsonb,
              NOW()
            )
          `);
        } catch (pushErr) {
          logger.warn({ pushErr }, 'ambient-presence: push queue insert failed');
        }

        totalProcessed++;
        logger.info({ userId: user.user_id }, 'ambient-presence: food signal check-in sent');
      } catch (err) {
        logger.error({ err, userId: user.user_id }, 'ambient-presence: food user error');
      }
    }
  } catch (err) {
    logger.error({ err }, 'ambient-presence: food signal scan failed');
  }

  // ── 2. RECURRING NEED DETECTION ─────────────────────────────────────────
  // Users who posted 3+ requests of the same category in 30 days
  // who haven't seen the recurring request feature suggested yet
  try {
    const recurringRows = await db.execute(sql`
      SELECT
        hr.user_id,
        u.name AS user_name,
        hr.category,
        COUNT(*) AS request_count
      FROM help_requests hr
      JOIN users u ON u.id = hr.user_id
      WHERE hr.created_at >= NOW() - INTERVAL '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM nia_conversations nc
          WHERE nc.user_id = hr.user_id
            AND nc.role = 'assistant'
            AND LOWER(nc.content) LIKE '%recurring%'
            AND nc.created_at >= NOW() - INTERVAL '7 days'
        )
      GROUP BY hr.user_id, u.name, hr.category
      HAVING COUNT(*) >= 3
      LIMIT ${BATCH_SIZE}
    `);

    const recurringUsers = (recurringRows.rows ?? recurringRows as any[]) as Array<{
      user_id: number;
      user_name: string;
      category: string;
      request_count: number;
    }>;

    for (const user of recurringUsers) {
      try {
        const firstName = user.user_name?.split(' ')[0] ?? 'friend';
        const categoryLabel = user.category?.replace(/_/g, ' ') ?? 'help';
        const niaMessage = [
          `Hey ${firstName} 💙`,
          ``,
          `I noticed you've been posting ${categoryLabel} requests pretty regularly — ${user.request_count} times in the last month.`,
          ``,
          `Did you know Niakofa has a recurring request feature? Instead of posting from scratch each time, you can set up a standing request and neighbors can sign up to help on a schedule.`,
          ``,
          `Just go to + New Request and look for the 'Recurring' option. Might save you some time. 💙`,
        ].join('\n');

        try {
          await db.execute(sql`
            INSERT INTO nia_conversations (user_id, role, content, created_at)
            VALUES (${user.user_id}, 'assistant', ${niaMessage}, NOW())
          `);
        } catch (convErr) {
          logger.warn({ convErr }, 'ambient-presence: recurring conv insert failed');
        }

        totalProcessed++;
        logger.info({ userId: user.user_id, category: user.category }, 'ambient-presence: recurring need tip sent');
      } catch (err) {
        logger.error({ err, userId: user.user_id }, 'ambient-presence: recurring user error');
      }
    }
  } catch (err) {
    logger.error({ err }, 'ambient-presence: recurring scan failed');
  }

  // ── 3. SILENT USER WARM CHECK-IN ────────────────────────────────────────
  // Users active 7-14 days ago who haven't opened a Nia conversation in 7 days
  try {
    const silentRows = await db.execute(sql`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        MAX(hr.created_at) AS last_activity
      FROM users u
      JOIN help_requests hr ON hr.user_id = u.id
      WHERE hr.created_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM nia_conversations nc
          WHERE nc.user_id = u.id
            AND nc.created_at >= NOW() - INTERVAL '7 days'
        )
        AND NOT EXISTS (
          SELECT 1 FROM nia_conversations nc2
          WHERE nc2.user_id = u.id
            AND nc2.role = 'assistant'
            AND LOWER(nc2.content) LIKE '%checking in%'
            AND nc2.created_at >= NOW() - INTERVAL '14 days'
        )
      GROUP BY u.id, u.name
      LIMIT ${BATCH_SIZE}
    `);

    const silentUsers = (silentRows.rows ?? silentRows as any[]) as Array<{
      user_id: number;
      user_name: string;
      last_activity: Date;
    }>;

    for (const user of silentUsers) {
      try {
        const firstName = user.user_name?.split(' ')[0] ?? 'friend';
        const niaMessage = [
          `Hey ${firstName} 💙`,
          ``,
          `Just checking in — I haven't seen you around in a bit. How are you doing?`,
          ``,
          `I'm here whenever you need anything. No rush. Just wanted you to know.`,
        ].join('\n');

        try {
          await db.execute(sql`
            INSERT INTO nia_conversations (user_id, role, content, created_at)
            VALUES (${user.user_id}, 'assistant', ${niaMessage}, NOW())
          `);
        } catch (convErr) {
          logger.warn({ convErr }, 'ambient-presence: silent user conv insert failed');
        }

        totalProcessed++;
        logger.info({ userId: user.user_id }, 'ambient-presence: silent user warm check-in sent');
      } catch (err) {
        logger.error({ err, userId: user.user_id }, 'ambient-presence: silent user error');
      }
    }
  } catch (err) {
    logger.error({ err }, 'ambient-presence: silent user scan failed');
  }

  logger.info({ totalProcessed }, 'ambient-presence-worker: cycle complete');
}

// ── Main entry: run once on startup then every 4 hours ────────────────────
export async function startAmbientPresenceWorker(): Promise<void> {
  logger.info('ambient-presence-worker: starting');

  // Stagger startup by 10 minutes to avoid thundering herd with other workers
  setTimeout(async () => {
    try {
      await runAmbientPresence();
    } catch (err) {
      logger.error({ err }, 'ambient-presence-worker: startup run failed');
    }

    // Then every 4 hours
    setInterval(async () => {
      try {
        await runAmbientPresence();
      } catch (err) {
        logger.error({ err }, 'ambient-presence-worker: interval run failed');
      }
    }, 4 * 60 * 60 * 1000);
  }, 10 * 60 * 1000); // 10-minute startup delay
}
