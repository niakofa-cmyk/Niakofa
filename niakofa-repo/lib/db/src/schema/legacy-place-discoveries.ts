import {
  pgTable, serial, integer, doublePrecision, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { familiesTable } from "./families";
import { familyPlacesTable } from "./family-places";
import { usersTable } from "./users";

export const legacyPlaceDiscoveriesTable = pgTable("legacy_place_discoveries", {
  id:                     serial("id").primaryKey(),
  family_id:              integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  place_id:               integer("place_id").notNull().references(() => familyPlacesTable.id, { onDelete: "cascade" }),
  discovered_by_user_id:  integer("discovered_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  lat:                    doublePrecision("lat"),
  lng:                    doublePrecision("lng"),
  accuracy_meters:        doublePrecision("accuracy_meters"),
  distance_meters:        doublePrecision("distance_meters"),
  created_at:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("legacy_place_discoveries_unique_place").on(t.family_id, t.place_id),
  index("idx_legacy_place_discoveries_family").on(t.family_id),
]);

export type LegacyPlaceDiscovery = typeof legacyPlaceDiscoveriesTable.$inferSelect;
export type InsertLegacyPlaceDiscovery = typeof legacyPlaceDiscoveriesTable.$inferInsert;
