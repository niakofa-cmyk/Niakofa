import { pgTable, serial, text, real, boolean, timestamp, index } from "drizzle-orm/pg-core";

/**
 * civic_resources — food pantries, shelters, legal aid, and other
 * community-support orgs, matched to callers by region (state/county/city).
 *
 * Map geo fields (migration 0067): latitude/longitude/address/open_hours are
 * nullable — older seeded rows (region-matched only, no pin) keep working via
 * the existing /civic/resources region-lookup route; only rows with
 * latitude+longitude set are eligible to appear on the map via
 * /civic/resources/nearby.
 *
 * open_hours is a small JSON string keyed by 3-letter day abbreviation
 * (sun..sat), each value either `"HH:MM-HH:MM"` (24h) or `null` for closed,
 * e.g. `{"mon":"09:00-17:00","sun":null}`. Parsed by computeOpenStatus() in
 * civic.ts. Interpreted in server-local time — acceptable approximation
 * since seeded resources are all US/Central for now; a per-resource
 * timezone field would be needed to generalize globally.
 */
export const civicResourcesTable = pgTable("civic_resources", {
  id: serial("id").primaryKey(),
  state: text("state").notNull(),
  county: text("county").notNull(),
  city: text("city"),
  org_name: text("org_name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  phone: text("phone"),
  category: text("category"),
  /** Street address for display in the map bottom-sheet. */
  address: text("address"),
  /** Map pin latitude. Null = not yet geocoded, excluded from /civic/resources/nearby. */
  latitude: real("latitude"),
  /** Map pin longitude. Null = not yet geocoded, excluded from /civic/resources/nearby. */
  longitude: real("longitude"),
  /** JSON weekly schedule string — see module doc comment above. */
  open_hours: text("open_hours"),
  /** Data provenance and geographic coverage metadata. */
  jurisdiction_level: text("jurisdiction_level").notNull().default("county"),
  source_name: text("source_name"),
  source_url: text("source_url"),
  last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
  is_authoritative: boolean("is_authoritative").notNull().default(false),
  /** Coverage lifecycle: verified, baseline, needs_verification. */
  coverage_status: text("coverage_status").notNull().default("needs_verification"),
  /** Stable Census GEOID when attached to a Census geography. */
  geoid: text("geoid"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_civic_resources_geo").on(t.latitude, t.longitude),
  index("idx_civic_resources_category").on(t.category),
  index("idx_civic_resources_geoid").on(t.geoid),
  index("idx_civic_resources_coverage_status").on(t.coverage_status),
]);

export type CivicResource = typeof civicResourcesTable.$inferSelect;
export type InsertCivicResource = typeof civicResourcesTable.$inferInsert;

/**
 * Coverage registry independent of resource URLs. Census place records can be
 * tracked even when the municipality's official resource has not been verified.
 */
export const civicJurisdictionsTable = pgTable("civic_jurisdictions", {
  id: serial("id").primaryKey(),
  state: text("state").notNull(),
  county: text("county"),
  city: text("city"),
  geoid: text("geoid").notNull().unique(),
  jurisdiction_level: text("jurisdiction_level").notNull(),
  source_name: text("source_name").notNull(),
  source_url: text("source_url").notNull(),
  coverage_status: text("coverage_status").notNull().default("needs_verification"),
  last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_civic_jurisdictions_state_county_city").on(t.state, t.county, t.city),
  index("idx_civic_jurisdictions_coverage_status").on(t.coverage_status),
]);

export type CivicJurisdiction = typeof civicJurisdictionsTable.$inferSelect;
export type InsertCivicJurisdiction = typeof civicJurisdictionsTable.$inferInsert;
