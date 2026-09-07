import { pgTable, serial, text, timestamp, boolean, uniqueIndex, doublePrecision, jsonb } from "drizzle-orm/pg-core";

/**
 * Per-city "Neighborhood Circles" content. Fort Worth's rows are the
 * original hand-written content (source: "curated", verified: true,
 * seeded by migration). Every other city is generated on first request via
 * nia-service's Claude-backed /generate-neighborhoods endpoint, cached
 * here, and marked unverified until an admin reviews/corrects it.
 *
 * Geometry fields (center/radius or polygon_geojson) are optional. Only
 * geometry_verified rows may tighten neighborhood Spiral host eligibility.
 * Missing geometry must never invent a boundary.
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
  // Optional authoritative geometry for neighborhood host geofencing.
  center_lat: doublePrecision("center_lat"),
  center_lng: doublePrecision("center_lng"),
  radius_meters: doublePrecision("radius_meters"),
  /** GeoJSON Polygon or MultiPolygon (coordinates in [lng, lat]). */
  polygon_geojson: jsonb("polygon_geojson").$type<Record<string, unknown> | null>(),
  geometry_source: text("geometry_source"),
  geometry_version: text("geometry_version"),
  geometry_verified: boolean("geometry_verified").notNull().default(false),
  geometry_effective_at: timestamp("geometry_effective_at", { withTimezone: true }),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("city_neighborhoods_city_key_neighborhood_id_idx").on(t.city_key, t.neighborhood_id),
]);

export type CityNeighborhood = typeof cityNeighborhoodsTable.$inferSelect;
export type InsertCityNeighborhood = typeof cityNeighborhoodsTable.$inferInsert;
