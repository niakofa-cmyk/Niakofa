import { pgTable, serial, text, real, timestamp, index } from "drizzle-orm/pg-core";

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
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_civic_resources_geo").on(t.latitude, t.longitude),
  index("idx_civic_resources_category").on(t.category),
]);

export type CivicResource = typeof civicResourcesTable.$inferSelect;
export type InsertCivicResource = typeof civicResourcesTable.$inferInsert;
