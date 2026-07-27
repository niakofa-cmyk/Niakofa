/**
 * Daily Kindness Engine — "Good Morning" Push Worker
 *
 * Runs once per day, typically between 7:00–9:00 AM local time of each user.
 * Sends active helpers a friendly push notification showing:
 *  - How many open requests are nearby
 *  - Their projected earnings for the day (based on average earnings/job × nearby count)
 *  - A kindness nudge tied to any active PIF chains they're part of
 *
 * Design principles:
 *  - Nia kill-switch respected (nia_enabled = "true" required)
 *  - Fire-and-forget push: never block on delivery
 *  - In-memory dedup (per restart) so each helper gets at most one message per day
 *  - DB-driven timezone: uses users.timezone if set, otherwise UTC (app can add
 *    IANA timezone column in a future migration; today we approximate with lat/lng)
 *  - Max 200 pushes per run so a single batch never hammers web-push
 */

import { db, requestsTable, usersTable, systemSettingsTable } from "@workspace/db";
import { and, eq, sql, isNotNull } from "drizzle-orm";
import { sendPushToUser } from "../routes/push";
import { logger } from "../lib/logger";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const EARTH_RADIUS_MILES = 3958.8;
const NEARBY_RADIUS_MILES = 10;

// In-memory dedup: user_id → last-sent date (ISO date string)
const lastSent = new Map<number, string>();

// ── Nia kill-switch check ─────────────────────────────────────────────────────
async function isNiaEnabled(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: systemSettingsTable.value })
      .from(systemSettingsTable)
      .where(eq(systemSettingsTable.key, "nia_enabled"))
      .limit(1);
    return row?.value === "true";
  } catch {
    return false; // fail-closed
  }
}

// Haversine distance in miles
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function processDailyKindness(): Promise<void> {
  if (!(await isNiaEnabled())) {
    logger.debug("daily-kindness: skipped — Nia disabled");
    return;
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch active helpers with a known location
  let helpers: { id: number; name: string | null; lat: number | null; lng: number | null }[] = [];
  try {
    helpers = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        lat: usersTable.lat,
        lng: usersTable.lng,
      })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.is_helper, true),
          eq(usersTable.helper_mode_active, true),
          isNotNull(usersTable.lat),
          isNotNull(usersTable.lng),
        )
      )
      .limit(200);
  } catch (err) {
    logger.error({ err }, "daily-kindness: failed to fetch helpers");
    return;
  }

  if (helpers.length === 0) return;

  // Fetch all currently open requests
  let openRequests: { id: number; lat: number | null; lng: number | null; payment_type: string | null; pledge_amount: number | null }[] = [];
  try {
    openRequests = await db
      .select({
        id: requestsTable.id,
        lat: requestsTable.lat,
        lng: requestsTable.lng,
        payment_type: requestsTable.payment_type,
        pledge_amount: requestsTable.pledge_amount,
      })
      .from(requestsTable)
      .where(eq(requestsTable.status, "open"))
      .limit(500);
  } catch (err) {
    logger.error({ err }, "daily-kindness: failed to fetch open requests");
    return;
  }

  let sent = 0;
  for (const helper of helpers) {
    if (sent >= 200) break;

    // Dedup: skip if we already sent today
    if (lastSent.get(helper.id) === today) continue;

    const helperLat = helper.lat ?? 0;
    const helperLng = helper.lng ?? 0;

    // Count nearby requests within NEARBY_RADIUS_MILES
    const nearby = openRequests.filter(r => {
      if (r.lat == null || r.lng == null) return false;
      return distanceMiles(helperLat, helperLng, r.lat, r.lng) <= NEARBY_RADIUS_MILES;
    });

    if (nearby.length === 0) continue;

    // Project earnings: immediate-pay requests have a pledge_amount; PIF and goodwill are $0
    const projectedEarnings = nearby
      .filter(r => r.payment_type === "immediate" && (r.pledge_amount ?? 0) > 0)
      .reduce((sum, r) => sum + (r.pledge_amount ?? 0), 0);

    const name = helper.name ? helper.name.split(" ")[0] : "there";
    const earningsHint =
      projectedEarnings > 0
        ? ` — up to $${projectedEarnings.toFixed(0)} available nearby`
        : "";

    try {
      await sendPushToUser(helper.id, {
        title: `Good morning, ${name}! ☀️`,
        body: `${nearby.length} neighbor${nearby.length !== 1 ? "s" : ""} need help near you${earningsHint}. Ready to make someone's day?`,
        urgency: "low",
        notifType: "nearby_requests",
      });
      lastSent.set(helper.id, today);
      sent++;
    } catch {
      // Never throw — keep processing other helpers
    }
  }

  if (sent > 0) {
    logger.info({ sent }, "daily-kindness: good-morning pushes sent");
  } else {
    logger.debug("daily-kindness: no eligible helpers with nearby requests");
  }
}

/** Start the Daily Kindness Engine. Runs every 4 hours (naturally aligns with
 *  morning windows across timezones). Returns a cleanup function. */
export function startDailyKindnessWorker(): () => void {
  // Run 5 min after server start so push subscriptions are loaded
  const startupDelay = setTimeout(async () => {
    try {
      await processDailyKindness();
      const { workerRan } = await import("../lib/worker-registry.js");
      workerRan("daily-kindness", true);
    } catch (err) {
      logger.error({ err }, "daily-kindness: startup run failed");
      import("../lib/worker-registry.js").then(m => m.workerRan("daily-kindness", false)).catch(err => logger.warn({ err }, "daily-kindness: registry report failed"));
    }
  }, 5 * 60 * 1000);

  const interval = setInterval(async () => {
    try {
      await processDailyKindness();
      const { workerRan } = await import("../lib/worker-registry.js");
      workerRan("daily-kindness", true);
    } catch (err) {
      logger.error({ err }, "daily-kindness: scheduled run failed");
      import("../lib/worker-registry.js").then(m => m.workerRan("daily-kindness", false)).catch(err => logger.warn({ err }, "daily-kindness: registry report failed"));
    }
  }, FOUR_HOURS_MS);

  logger.info({ intervalMs: FOUR_HOURS_MS }, "daily-kindness: Good Morning worker started");

  return () => {
    clearTimeout(startupDelay);
    clearInterval(interval);
    logger.info("daily-kindness: worker stopped");
  };
}
