import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, numeric, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { communitiesTable } from "./communities";

// Durable geographic community nodes. Non-U.S. hubs are country-level;
// U.S. hubs are state-level. `name` remains the stable anchor identity used
// by existing neighborhood/story aggregation; `display_name` is the public
// Hub label shown by the Globe.
export const diasporaHubsTable = pgTable("diaspora_hubs", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  display_name: text("display_name"),
  region_label: text("region_label").notNull(),
  lat:          doublePrecision("lat").notNull(),
  lng:          doublePrecision("lng").notNull(),
  tag:          text("tag").notNull().default("country"),
  hub_scope:    text("hub_scope").notNull().default("country"),
  country_code: text("country_code"),
  subdivision_code: text("subdivision_code"),
  anchor_city:  text("anchor_city"),
  // Globe *display* grouping only — points a legacy local-city hub at its
  // country's canonical hub so the Globe renders one marker per country.
  // The child hub's own id, community_id, stories, pledges, and other
  // relationships are completely unaffected; this never triggers a delete.
  primary_hub_id: integer("primary_hub_id").references((): AnyPgColumn => diasporaHubsTable.id),
  note:         text("note"),
  community_id: integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  is_seed:      boolean("is_seed").notNull().default(false),
  status:       text("status").notNull().default("approved"),
  created_by:   integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  is_crisis:          boolean("is_crisis").notNull().default(false),
  crisis_message:     text("crisis_message"),
  crisis_declared_at: timestamp("crisis_declared_at", { withTimezone: true }),
  crisis_declared_by: integer("crisis_declared_by").references(() => usersTable.id, { onDelete: "set null" }),
  crisis_resolved_note: text("crisis_resolved_note"),
  crisis_cleared_at:    timestamp("crisis_cleared_at", { withTimezone: true }),
  crisis_cleared_by:    integer("crisis_cleared_by").references(() => usersTable.id, { onDelete: "set null" }),
  target_reserve_amount: numeric("target_reserve_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  reserved_balance:      numeric("reserved_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  presence_radius_km: doublePrecision("presence_radius_km").notNull().default(35),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("diaspora_hubs_name_unique").on(t.name),
]);

export type DiasporaHub = typeof diasporaHubsTable.$inferSelect;
export type InsertDiasporaHub = typeof diasporaHubsTable.$inferInsert;
