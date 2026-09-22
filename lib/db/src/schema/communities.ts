import { pgTable, serial, text, real, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * communities — region-scoped community funding pools.
 *
 * Each community (county, city, neighbourhood) has a target_reserve_amount
 * set by an admin — the "healthy" pool balance for that region.
 *
 * The wage multiplier for helpers in this community becomes:
 *   tier_multiplier × clamp(pool_balance / target_reserve_amount, 0.5, 1.0)
 *
 * Clamping to [0.5, 1.0] means:
 *   - A fully-funded pool (balance ≥ target) gives the full tier bonus.
 *   - A depleted pool (balance ≤ 50% of target) still pays 50% of the bonus
 *     so helpers are never penalised to zero, but the pool can't be drained
 *     into insolvency by high multipliers.
 *
 * Seeded with a single "Tarrant County" row on first install so every
 * existing users.community_id can resolve without changes to legacy data.
 *
 * Per-county livable wage: hourly_rate overrides the global
 * pool_minimum_hourly_rate system setting for this community when set.
 * Null = fall through to the global setting ($15/hr default).
 */
export const communitiesTable = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  target_reserve_amount: real("target_reserve_amount").notNull().default(10000),
  /** Per-county livable wage override ($/hr). Null = use global pool_minimum_hourly_rate. */
  hourly_rate: real("hourly_rate"),
  /** Human-readable description for the county impact dashboard. */
  description: text("description"),
  /** Name of the sponsoring county/entity displayed on the public impact page. */
  sponsor_name: text("sponsor_name"),
  /** URL for the county/sponsor logo on the public impact page. */
  sponsor_logo_url: text("sponsor_logo_url"),
  /** County identifier used for public impact page routing (e.g. "tarrant"). */
  county: text("county"),
  /** State abbreviation (e.g. "TX"). */
  state: text("state"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type Community = typeof communitiesTable.$inferSelect;
export type NewCommunity = typeof communitiesTable.$inferInsert;
