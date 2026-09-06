import {
  pgTable, serial, integer, text, timestamp, doublePrecision, index,
} from "drizzle-orm/pg-core";
import { familiesTable } from "./families";

// ─── Family Vault: Places ─────────────────────────────────────────────────────
// Geographic locations tied to a family's history — ancestral villages, homes,
// schools, churches, businesses, cemeteries, and migration waypoints.

export const familyPlacesTable = pgTable("family_places", {
  id:            serial("id").primaryKey(),
  family_id:     integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  label:         text("label").notNull(),          // "Kumasi", "Cape Coast Castle"
  place_type:    text("place_type"),               // village|town|city|school|church|cemetery|business|landmark
  country:       text("country"),
  region:        text("region"),
  lat:           doublePrecision("lat"),
  lng:           doublePrecision("lng"),
  notes:         text("notes"),                    // free-text context about this place
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_places_family").on(t.family_id),
]);

export type FamilyPlace = typeof familyPlacesTable.$inferSelect;
export type InsertFamilyPlace = typeof familyPlacesTable.$inferInsert;
