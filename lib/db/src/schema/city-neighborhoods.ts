import { pgTable, serial, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Per-city "Neighborhood Circles" content. Fort Worth's rows are the
 * original hand-written content (source: "curated", verified: true,
 * seeded by migration). Every other city is generated on first request via
 * nia-service's Claude-backed /generate-neighborhoods endpoint, cached
 * here, and marked unverified until an admin reviews/corrects it.
 */
export const cityNeighborhoodsTable = pgTable("city_neighborhoods", {
  id: serial("id").primaryKey(),
  // Normalized lookup key, e.g. "fort_worth", "atlanta", "houston".
  city_key: text("city_key").notNull(),
  // Display name of the city as entered by users, kept for admin UI context.
  city_display: text("city_display").notNull(),
  neighborhood_id: text("neighborhood_id").notNull(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📍"),
  description: text("description").notNull(),
  source: text("source").notNull().default("generated"), // "curated" | "generated"
  verified: boolean("verified").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("city_neighborhoods_city_key_neighborhood_id_idx").on(t.city_key, t.neighborhood_id),
]);

export type CityNeighborhood = typeof cityNeighborhoodsTable.$inferSelect;
export type InsertCityNeighborhood = typeof cityNeighborhoodsTable.$inferInsert;
