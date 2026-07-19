import { pgTable, serial, text, integer, numeric, real, date, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { governmentSponsorsTable } from "./government-sponsors";

/**
 * civic_needs — county/gov-sponsor posts a community need (FIX 2, migration 0057).
 *
 * Two-way civic portal: previously sponsors could only fund the pool; now they
 * can also post specific needs that helpers/businesses claim and fulfil.
 *
 * Status lifecycle: open → claimed → completed | cancelled
 */
export const civicNeedsTable = pgTable("civic_needs", {
  id:                    serial("id").primaryKey(),
  // FIX (data-loss audit): was onDelete "cascade" — deleting the posting
  // user's account silently destroyed the entire civic need (title,
  // geocoded lat/lng, claim/completion history), even for needs another
  // user had already claimed or fulfilled. claimed_by_user_id below already
  // used "set null" for exactly this reason; posted_by_user_id was the
  // inconsistent one. Now made NOT NULL-safe by dropping the notNull()
  // constraint — the need survives with an orphaned author reference.
  posted_by_user_id:     integer("posted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  // FIX: was onDelete "cascade" — removing/re-seeding a government sponsor
  // record wiped every civic need it ever posted, including completed ones
  // that are part of the county's public fulfillment record. "restrict"
  // means a sponsor can't be deleted while it still has needs attached,
  // forcing an explicit decision instead of a silent bulk delete.
  government_sponsor_id: integer("government_sponsor_id").notNull().references(() => governmentSponsorsTable.id, { onDelete: "restrict" }),
  title:                 text("title").notNull(),
  description:           text("description"),
  category:              text("category").notNull().default("other"),
  estimated_cost:        numeric("estimated_cost", { precision: 12, scale: 2 }),
  due_date:              date("due_date"),
  /**
   * Map pin coords (migration 0067). Resolved lazily on read from the
   * sponsor's county/city/state via forward geocoding (see
   * resolveNeedCoords() in civic.ts) and persisted back here so it's only
   * geocoded once. Null until first resolved — needs with null lat/lng are
   * excluded from /civic/needs/nearby.
   */
  lat:                   real("lat"),
  lng:                   real("lng"),
  // status: open | claimed | completed | cancelled
  status:                text("status").notNull().default("open"),
  claimed_by_user_id:    integer("claimed_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  claimed_at:            timestamp("claimed_at", { withTimezone: true }),
  completed_at:          timestamp("completed_at", { withTimezone: true }),
  cancelled_at:          timestamp("cancelled_at", { withTimezone: true }),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at:            timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  index("idx_civic_needs_status").on(t.status, t.created_at),
  index("idx_civic_needs_sponsor").on(t.government_sponsor_id),
]);

export type CivicNeed = typeof civicNeedsTable.$inferSelect;
export type InsertCivicNeed = typeof civicNeedsTable.$inferInsert;
