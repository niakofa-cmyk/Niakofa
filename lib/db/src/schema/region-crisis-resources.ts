import { pgTable, serial, text, boolean, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Admin-gated, per-region emergency resources (USA rollout). Unlike the
 * AI-generated neighborhood "flavor" content, emergency contacts are
 * life-safety-critical and must NEVER be auto-populated or guessed by an
 * LLM. A region row is created (unverified, with the safe national fallback)
 * the first time activity is seen in that region; an admin then enters the
 * REAL, sourced local contacts and marks it verified. Until verified, users
 * see only the national fallback (911 / 211 / SAMHSA), never an unverified
 * local guess.
 */
export const regionCrisisResourcesTable = pgTable("region_crisis_resources", {
  id: serial("id").primaryKey(),
  // Normalized region key, e.g. "tarrant_county_tx", "fulton_county_ga".
  region_key: text("region_key").notNull(),
  region_display: text("region_display").notNull(),
  // ISO state/admin code for grouping in the admin UI, e.g. "TX", "GA".
  state_code: text("state_code"),
  country_code: text("country_code").notNull().default("US"),
  // JSON array of { label, phone?, url? } — same shape the crisis banner uses.
  resources: text("resources").notNull().default("[]"),
  // verified=false means "seen but not yet confirmed by an admin" — users get
  // the national fallback until an admin verifies real local contacts.
  verified: boolean("verified").notNull().default(false),
  // Optional admin note (source of the data, last-checked date, etc.)
  notes: text("notes"),
  verified_by: integer("verified_by"),
  verified_at: timestamp("verified_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("region_crisis_resources_region_key_idx").on(t.region_key),
  index("region_crisis_resources_state_idx").on(t.state_code),
  index("region_crisis_resources_verified_idx").on(t.verified),
]);

export type RegionCrisisResource = typeof regionCrisisResourcesTable.$inferSelect;
export type InsertRegionCrisisResource = typeof regionCrisisResourcesTable.$inferInsert;
