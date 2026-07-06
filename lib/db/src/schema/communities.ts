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
 */
export const communitiesTable = pgTable("communities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  target_reserve_amount: real("target_reserve_amount").notNull().default(10000),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type Community = typeof communitiesTable.$inferSelect;
export type NewCommunity = typeof communitiesTable.$inferInsert;
