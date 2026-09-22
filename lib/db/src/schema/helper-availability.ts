import { pgTable, serial, integer, smallint, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/**
 * helper_availability — weekly recurring time windows per helper.
 *
 * day_of_week: 0 (Sun) – 6 (Sat), matching JS Date.getDay().
 * start_min / end_min: minutes from midnight (0–1440).
 *   e.g. 9:00 AM = 540, 5:30 PM = 1050, midnight end = 1440.
 *
 * Stored as integers so the matching engine can do a trivial
 *   currentDayOfWeek === day_of_week && currentMinute >= start_min && currentMinute < end_min
 * check without any date-parsing overhead.
 *
 * Replacing a helper's schedule is a DELETE WHERE user_id + bulk INSERT —
 * no partial-update complexity.
 */
export const helperAvailabilityTable = pgTable(
  "helper_availability",
  {
    id:          serial("id").primaryKey(),
    user_id:     integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    day_of_week: smallint("day_of_week").notNull(), // 0–6
    start_min:   smallint("start_min").notNull(),   // 0–1439
    end_min:     smallint("end_min").notNull(),     // 1–1440
  },
  (t) => [
    check("availability_day_range",   sql`${t.day_of_week} BETWEEN 0 AND 6`),
    check("availability_start_range", sql`${t.start_min}   BETWEEN 0 AND 1439`),
    check("availability_end_range",   sql`${t.end_min}     BETWEEN 1 AND 1440`),
    check("availability_start_before_end", sql`${t.start_min} < ${t.end_min}`),
    // Composite unique: a helper can only have one time window per (day, start)
    // pair, preventing duplicate rows from a race condition or double-submit
    // during the schedule-replacement flow.
    unique("helper_availability_user_day_start_uidx").on(t.user_id, t.day_of_week, t.start_min),
  ]
);

export type HelperAvailability = typeof helperAvailabilityTable.$inferSelect;
export type InsertHelperAvailability = typeof helperAvailabilityTable.$inferInsert;
