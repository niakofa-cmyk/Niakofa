import { pgTable, serial, text, timestamp, boolean, uniqueIndex, doublePrecision, jsonb } from "drizzle-orm/pg-core";

/**
 * Per-city neighborhood content. Fort Worth's original rows are curated;
 * other cities may begin as generated discovery hints until an admin reviews
 * their names and attaches trustworthy source/geometry provenance.
 *
 * Geometry is operationally authoritative only when geometry_verified is true
 * and source_kind is not generated_hint. Missing geometry must never invent a
 * boundary from an LLM response or a geocoder neighborhood label.
 */
export const cityNeighborhoodsTable = pgTable("city_neighborhoods", {
  id: serial("id").primaryKey(),
  city_key: text("city_key").notNull(),
  city_display: text("city_display").notNull(),
  neighborhood_id: text("neighborhood_id").notNull(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📍"),
  description: text("description").notNull(),
  source: text("source").notNull().default("generated"),
  verified: boolean("verified").notNull().default(false),
  center_lat: doublePrecision("center_lat"),
  center_lng: doublePrecision("center_lng"),
  radius_meters: doublePrecision("radius_meters"),
  polygon_geojson: jsonb("polygon_geojson").$type<Record<string, unknown> | null>(),
  geometry_source: text("geometry_source"),
  geometry_version: text("geometry_version"),
  geometry_verified: boolean("geometry_verified").notNull().default(false),
  geometry_effective_at: timestamp("geometry_effective_at", { withTimezone: true }),
  source_publisher: text("source_publisher"),
  source_url: text("source_url"),
  source_license: text("source_license"),
  source_retrieved_at: timestamp("source_retrieved_at", { withTimezone: true }),
  source_version: text("source_version"),
  source_kind: text("source_kind").notNull().default("generated_hint"),
  authority_level: text("authority_level").notNull().default("generated"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("city_neighborhoods_city_key_neighborhood_id_idx").on(t.city_key, t.neighborhood_id),
]);

export type CityNeighborhood = typeof cityNeighborhoodsTable.$inferSelect;
export type InsertCityNeighborhood = typeof cityNeighborhoodsTable.$inferInsert;
