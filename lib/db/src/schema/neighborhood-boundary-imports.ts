import { boolean, doublePrecision, jsonb, pgTable, bigserial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Raw/staged neighborhood geography from a reviewed public source.
 *
 * Importing a feature never makes it GPS-host eligible. An admin must review
 * the imported feature and its geometry before geometry_verified can become
 * true and the feature can be promoted into city_neighborhoods.
 */
export const neighborhoodBoundaryImportsTable = pgTable("neighborhood_boundary_imports", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  city_key: text("city_key").notNull(),
  city_display: text("city_display").notNull(),
  source_kind: text("source_kind").notNull(),
  authority_level: text("authority_level").notNull(),
  source_publisher: text("source_publisher").notNull(),
  source_url: text("source_url").notNull(),
  source_dataset: text("source_dataset").notNull(),
  source_feature_id: text("source_feature_id").notNull(),
  source_version: text("source_version"),
  source_license: text("source_license"),
  source_retrieved_at: timestamp("source_retrieved_at", { withTimezone: true }).notNull(),
  name: text("name").notNull(),
  neighborhood_id: text("neighborhood_id").notNull(),
  polygon_geojson: jsonb("polygon_geojson").$type<Record<string, unknown> | null>(),
  center_lat: doublePrecision("center_lat"),
  center_lng: doublePrecision("center_lng"),
  radius_meters: doublePrecision("radius_meters"),
  geometry_valid: boolean("geometry_valid").notNull().default(false),
  geometry_verified: boolean("geometry_verified").notNull().default(false),
  reviewed: boolean("reviewed").notNull().default(false),
  review_note: text("review_note"),
  rejection_reason: text("rejection_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("neighborhood_boundary_imports_source_feature_idx").on(
    t.city_key,
    t.source_dataset,
    t.source_feature_id,
    t.source_version,
  ),
]);

export type NeighborhoodBoundaryImport = typeof neighborhoodBoundaryImportsTable.$inferSelect;
export type InsertNeighborhoodBoundaryImport = typeof neighborhoodBoundaryImportsTable.$inferInsert;
