/**
 * Recurring Request Subscriptions
 *
 * Lets users schedule repeating help requests (e.g. "grocery pickup every Tuesday").
 * The scheduler worker fires these at the right time and posts them to the open pool.
 */
import { Router } from "express";
import { isHelperAvailableNow } from "../lib/matching";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { db, recurringRequestsTable, requestsTable, usersTable, helperAvailabilityTable } from "@workspace/db";
import { eq, and, desc, lte, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { z } from "zod";

const router = Router();

// ── Validation ─────────────────────────────────────────────────────────────────

const createRecurringSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  // BUG-H09: must match requestCategoryEnum exactly (DB pgEnum)
  category: z.enum(["groceries", "transportation", "errands", "home_repair", "medical", "emergency", "other", "stock_shelves", "event_setup", "delivery_run", "tech_support", "local_farm", "food_pantry"]).default("other"),
  payment_type: z.enum(["immediate", "pay_it_forward", "goodwill"]).default("goodwill"),
  pay_it_forward_amount: z.number().min(1).max(500).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  neighborhood: z.string().max(80).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  day_of_week: z.number().min(0).max(6).optional(),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
});

const updateRecurringSchema = z.object({
  active: z.boolean().optional(),
  title: z.string().min(3).max(120).optional(),
  description: z.string().max(500).optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
  day_of_week: z.number().min(0).max(6).optional(),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────────

export function computeNextFireAt(
  recurrence: string,
  dayOfWeek: number | null | undefined,
  timeOfDay: string,
  from: Date = new Date(),
): Date {
  const [hStr, mStr] = timeOfDay.split(":");
  const h = parseInt(hStr ?? "9", 10);
  const m = parseInt(mStr ?? "0", 10);

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(h, m, 0, 0);

  if (next <= from) {
    if (recurrence === "daily") {
      next.setDate(next.getDate() + 1);
    } else if (recurrence === "weekly") {
      // Advance a full week, not 1 day — without this, a weekly recurrence
      // with no day_of_week set would effectively fire daily, since the
      // day-of-week correction loop below only runs when dayOfWeek is set.
      next.setDate(next.getDate() + 7);
    } else if (recurrence === "monthly") {
      next.setMonth(next.getMonth() + 1);
    }
  }

  if (recurrence === "weekly" && dayOfWeek != null) {
    while (next.getDay() !== dayOfWeek) {
      next.setDate(next.getDate() + 1);
    }
    if (next <= from) next.setDate(next.getDate() + 7);
  }

  return next;
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// GET /recurring — list the current user's recurring requests
router.get("/recurring", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  try {
    const rows = await db
      .select()
      .from(recurringRequestsTable)
      .where(eq(recurringRequestsTable.user_id, userId))
      .orderBy(desc(recurringRequestsTable.created_at));
    return res.json(rows);
  } catch (err) {
    logger.error({ err, userId }, "recurring: failed to list");
    return res.status(500).json({ error: "Failed to load recurring requests" });
  }
});

// POST /recurring — create a new recurring request subscription
router.post("/recurring", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;

  // BUG-H08: Only approved users may create recurring requests.
  // Pending/denied users could otherwise auto-fire requests at scale.
  const [userRow] = await db
    .select({ approval_status: usersTable.approval_status })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (userRow?.approval_status && userRow.approval_status !== "approved") {
    return res.status(403).json({ error: "Your account must be approved before creating recurring requests" });
  }

  const parsed = createRecurringSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  const data = parsed.data;
  const next_fire_at = computeNextFireAt(
    data.recurrence,
    data.day_of_week ?? null,
    data.time_of_day,
  );

  try {
    const [row] = await db.insert(recurringRequestsTable).values({
      user_id: userId,
      title: data.title,
      description: data.description ?? null,
      category: data.category,
      payment_type: data.payment_type,
      pay_it_forward_amount: data.pay_it_forward_amount ?? null,
      lat: data.lat,
      lng: data.lng,
      neighborhood: data.neighborhood ?? null,
      recurrence: data.recurrence,
      day_of_week: data.day_of_week ?? null,
      time_of_day: data.time_of_day,
      next_fire_at,
      active: true,
    }).returning();

    logger.info({ id: row?.id, userId, recurrence: data.recurrence }, "recurring: created");
    return res.status(201).json(row);
  } catch (err) {
    logger.error({ err, userId }, "recurring: failed to create");
    return res.status(500).json({ error: "Failed to create recurring request" });
  }
});

// PATCH /recurring/:id — toggle active, update schedule
router.patch("/recurring/:id", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = updateRecurringSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
  }

  try {
    const [existing] = await db
      .select()
      .from(recurringRequestsTable)
      .where(and(eq(recurringRequestsTable.id, id), eq(recurringRequestsTable.user_id, userId)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Not found" });

    const updates: Partial<typeof recurringRequestsTable.$inferInsert> = {};
    const { active, title, description, recurrence, day_of_week, time_of_day } = parsed.data;

    if (active !== undefined) updates.active = active;
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (recurrence !== undefined) updates.recurrence = recurrence;
    if (day_of_week !== undefined) updates.day_of_week = day_of_week;
    if (time_of_day !== undefined) updates.time_of_day = time_of_day;

    if (recurrence !== undefined || day_of_week !== undefined || time_of_day !== undefined) {
      updates.next_fire_at = computeNextFireAt(
        updates.recurrence ?? existing.recurrence,
        updates.day_of_week ?? existing.day_of_week,
        updates.time_of_day ?? existing.time_of_day,
      );
    }

    const [updated] = await db
      .update(recurringRequestsTable)
      .set(updates)
      .where(eq(recurringRequestsTable.id, id))
      .returning();

    logger.info({ id, userId }, "recurring: updated");
    return res.json(updated);
  } catch (err) {
    logger.error({ err, id, userId }, "recurring: failed to update");
    return res.status(500).json({ error: "Failed to update recurring request" });
  }
});

// DELETE /recurring/:id — remove a recurring request subscription
router.delete("/recurring/:id", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  try {
    const deleted = await db
      .delete(recurringRequestsTable)
      .where(and(eq(recurringRequestsTable.id, id), eq(recurringRequestsTable.user_id, userId)))
      .returning();

    if (!deleted.length) return res.status(404).json({ error: "Not found" });
    logger.info({ id, userId }, "recurring: deleted");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id, userId }, "recurring: failed to delete");
    return res.status(500).json({ error: "Failed to delete" });
  }
});


// GET /recurring/matched-helpers — Phase 10F
// Returns helpers whose recurring availability overlaps with the calling
// user's recurring request schedule. Surfaces repeat-requester → repeat-helper
// pairings so the community builds lasting relationships.
//
// Query params:
//   category  (optional) — filter helpers whose skills cover this category
//   lat + lng (optional) — sort by distance (requires both)
//   limit     (optional, default 10, max 50)
router.get("/recurring/matched-helpers", requireAuth, async (req, res) => {
  const userId = (req as any).user.id as number;
  const { category, lat, lng, limit: limitStr } = req.query as Record<string, string | undefined>;
  const limit = Math.min(parseInt(limitStr ?? "10", 10) || 10, 50);

  // 1. Load the requesting user's recurring requests to get their schedule
  const myRecurring = await db
    .select({
      day_of_week: recurringRequestsTable.day_of_week,
      time_of_day: recurringRequestsTable.time_of_day,
      category: recurringRequestsTable.category,
    })
    .from(recurringRequestsTable)
    .where(and(
      eq(recurringRequestsTable.user_id, userId),
      eq(recurringRequestsTable.active, true)
    ));

  if (myRecurring.length === 0) {
    return res.json({ helpers: [], message: "No active recurring requests found" });
  }

  // 2. Find helpers who have availability on the same days
  const myDays = [...new Set(myRecurring.map((r: (typeof myRecurring)[number]) => r.day_of_week).filter((d: number | null): d is number => d !== null))];

  const availableWindows = myDays.length > 0
    ? await db
        .select({
          user_id: helperAvailabilityTable.user_id,
          day_of_week: helperAvailabilityTable.day_of_week,
          start_min: helperAvailabilityTable.start_min,
          end_min: helperAvailabilityTable.end_min,
        })
        .from(helperAvailabilityTable)
        .where(inArray(helperAvailabilityTable.day_of_week, myDays.map(d => d as unknown as number & { __brand: "smallint" })))
    : await db
        .select({
          user_id: helperAvailabilityTable.user_id,
          day_of_week: helperAvailabilityTable.day_of_week,
          start_min: helperAvailabilityTable.start_min,
          end_min: helperAvailabilityTable.end_min,
        })
        .from(helperAvailabilityTable);

  if (availableWindows.length === 0) {
    return res.json({ helpers: [], message: "No helpers with matching availability found" });
  }

  // 3. Group windows by helper
  const windowsByHelper = new Map<number, typeof availableWindows>();
  for (const w of availableWindows) {
    const existing = windowsByHelper.get(w.user_id) ?? [];
    existing.push(w);
    windowsByHelper.set(w.user_id, existing);
  }

  // 4. Check overlap: helper must cover at least one of the requester's time slots
  const myTimeSlotsMin = myRecurring
    .filter((r: (typeof myRecurring)[number]) => r.day_of_week !== null && r.time_of_day)
    .map((r: (typeof myRecurring)[number]) => {
      const [h, m] = (r.time_of_day ?? "09:00").split(":").map(Number);
      return { day: r.day_of_week as number, min: h * 60 + m };
    });

  const matchedHelperIds: number[] = [];
  for (const [helperId, windows] of windowsByHelper.entries()) {
    const overlaps = myTimeSlotsMin.some((slot: { day: number; min: number }) =>
      windows.some((w: { day_of_week: number | null; start_min: number | null; end_min: number | null }) =>
        w.day_of_week === slot.day &&
        w.start_min !== null && w.end_min !== null &&
        w.start_min <= slot.min &&
        w.end_min > slot.min
      )
    );
    if (overlaps) matchedHelperIds.push(helperId);
  }

  if (matchedHelperIds.length === 0) {
    return res.json({ helpers: [], message: "No helpers with overlapping time slots" });
  }

  // 5. Load helper profiles
  const helpers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar_url: usersTable.avatar_url,
      trust_score: usersTable.trust_score,
      help_count: usersTable.help_count,
      helper_bio: usersTable.helper_bio,
      helper_skills: usersTable.helper_skills,
      identity_verified: usersTable.identity_verified,
      lat: usersTable.lat,
      lng: usersTable.lng,
      city: usersTable.city,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.is_helper, true),
      eq(usersTable.helper_mode_active, true),
      inArray(usersTable.id, matchedHelperIds.slice(0, 200))
    ));

  // 6. Filter by category skill match if requested
  let filtered = helpers;
  if (category) {
    filtered = helpers.filter((h: (typeof helpers)[number]) => {
      const skills = (h.helper_skills ?? []).map((s: string) => s.toLowerCase().replace(/\s+/g, "_"));
      return skills.some((s: string) =>
        s.includes(category.replace(/_/g, " ")) ||
        category.replace(/_/g, " ").includes(s)
      );
    });
    // Fall back to all matched helpers if no skill match
    if (filtered.length === 0) filtered = helpers;
  }

  // 7. Sort by distance if lat/lng provided, else by trust_score desc
  const userLat = lat ? parseFloat(lat) : null;
  const userLng = lng ? parseFloat(lng) : null;

  const scored = filtered.map((h: (typeof filtered)[number]) => {
    let distanceMiles: number | null = null;
    if (userLat !== null && userLng !== null && h.lat !== null && h.lng !== null) {
      const R = 3958.8;
      const dLat = ((h.lat - userLat) * Math.PI) / 180;
      const dLng = ((h.lng - userLng) * Math.PI) / 180;
      const a = Math.sin(dLat/2)**2 +
        Math.cos((userLat*Math.PI)/180) * Math.cos((h.lat*Math.PI)/180) * Math.sin(dLng/2)**2;
      distanceMiles = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    const availabilityWindows = windowsByHelper.get(h.id) ?? [];
    const isAvailableNow = isHelperAvailableNow(availabilityWindows);
    return { ...h, distance_miles: distanceMiles ? Math.round(distanceMiles * 10) / 10 : null, is_available_now: isAvailableNow, availability_windows: availabilityWindows };
  }).sort((a: { is_available_now: boolean; distance_miles: number | null; trust_score?: number | null }, b: { is_available_now: boolean; distance_miles: number | null; trust_score?: number | null }) => {
    // Available now first
    if (a.is_available_now !== b.is_available_now) return a.is_available_now ? -1 : 1;
    // Then by distance if we have it
    if (a.distance_miles !== null && b.distance_miles !== null) return a.distance_miles - b.distance_miles;
    // Finally by trust score
    return (b.trust_score ?? 0) - (a.trust_score ?? 0);
  });

  return res.json({ helpers: scored.slice(0, limit) });
});

export default router;

// ── Worker ─────────────────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function processRecurringRequests(): Promise<void> {
  const now = new Date();
  let due: (typeof recurringRequestsTable.$inferSelect)[] = [];

  try {
    due = await db
      .select()
      .from(recurringRequestsTable)
      .where(
        and(
          eq(recurringRequestsTable.active, true),
          lte(recurringRequestsTable.next_fire_at, now)
        )
      );
  } catch (err) {
    logger.error({ err }, "recurring-worker: failed to query due subscriptions");
    return;
  }

  if (!due.length) return;
  logger.info({ count: due.length }, "recurring-worker: firing subscriptions");

  const { sendPushToNearbyHelpers } = await import("../routes/push");

  for (const sub of due) {
    try {
      const [newReq] = await db.insert(requestsTable).values({
        title: sub.title,
        description: sub.description ?? undefined,
        category: sub.category as "groceries" | "transportation" | "errands" | "home_repair" | "medical" | "emergency" | "other" | "stock_shelves" | "event_setup" | "delivery_run" | "tech_support" | "local_farm" | "food_pantry",
        urgency: "medium",
        status: "open",
        payment_type: sub.payment_type as "immediate" | "pay_it_forward" | "goodwill",
        requester_id: sub.user_id,
        lat: sub.lat,
        lng: sub.lng,
        neighborhood: sub.neighborhood ?? undefined,
        pay_it_forward_amount: sub.pay_it_forward_amount ?? undefined,
      }).returning();

      const nextFire = computeNextFireAt(sub.recurrence, sub.day_of_week, sub.time_of_day, now);
      await db.update(recurringRequestsTable).set({
        last_fired_at: now,
        next_fire_at: nextFire,
      }).where(eq(recurringRequestsTable.id, sub.id));

      const [user] = await db.select({ name: usersTable.name }).from(usersTable)
        .where(eq(usersTable.id, sub.user_id)).limit(1);
      const userName = user?.name ?? "A neighbor";

      await sendPushToNearbyHelpers(sub.lat, sub.lng, 10, {
        title: `📅 Recurring Help Needed`,
        body: `${userName} needs help with "${sub.title}". It's a ${sub.recurrence} request — tap to claim.`,
        urgency: "normal",
        requestId: newReq?.id,
        notifType: "nearby_requests" as const,
      }).catch(() => {
        // Non-fatal: recurring request push failed — subscription will retry on next cycle
      });

      logger.info({ recurringId: sub.id, newRequestId: newReq?.id }, "recurring-worker: fired");
    } catch (err) {
      logger.error({ err, recurringId: sub.id }, "recurring-worker: failed to fire subscription");
    }
  }
}

// Recurring day label for display
export function dayLabel(dow: number | null | undefined): string {
  if (dow == null) return "";
  return DAYS[dow] ?? "";
}

