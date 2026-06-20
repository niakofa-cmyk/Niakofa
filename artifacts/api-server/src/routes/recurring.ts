/**
 * Recurring Request Subscriptions
 *
 * Lets users schedule repeating help requests (e.g. "grocery pickup every Tuesday").
 * The scheduler worker fires these at the right time and posts them to the open pool.
 */
import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { db, recurringRequestsTable, requestsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { z } from "zod/v4";

const router = Router();

// ── Validation ─────────────────────────────────────────────────────────────────

const createRecurringSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(["groceries", "ride", "errand", "tech", "meal", "moving", "childcare", "other"]).default("other"),
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
      next.setDate(next.getDate() + 1);
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
router.post("/recurring", requireAuth, async (req, res) => {
  const userId = req.authenticatedUserId!;

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

export default router;

// ── Worker ─────────────────────────────────────────────────────────────────────

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function processRecurringRequests(): Promise<void> {
  const now = new Date();
  let due: (typeof recurringRequestsTable.$inferSelect)[] = [];

  try {
    const { lte } = await import("drizzle-orm");
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
        category: sub.category as "groceries" | "transportation" | "errands" | "home_repair" | "medical" | "emergency" | "other" | "stock_shelves" | "event_setup" | "delivery_run" | "tech_support",
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
      }).catch(() => {});

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
