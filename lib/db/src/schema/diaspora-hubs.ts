import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { communitiesTable } from "./communities";

// Diaspora Globe hub cities. `presence_radius_km` is an operational radius for
// aggregate live-presence matching; it is not a legal city/neighborhood boundary.
export const diasporaHubsTable = pgTable("diaspora_hubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  region_label: text("region_label").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  tag: text("tag").notNull().default("us"),
  note: text("note"),
  community_id: integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  is_seed: boolean("is_seed").notNull().default(false),
  status: text("status").notNull().default("approved"),
  created_by: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  is_crisis: boolean("is_crisis").notNull().default(false),
  crisis_message: text("crisis_message"),
  crisis_declared_at: timestamp("crisis_declared_at", { withTimezone: true }),
  crisis_declared_by: integer("crisis_declared_by").references(() => usersTable.id, { onDelete: "set null" }),
  crisis_resolved_note: text("crisis_resolved_note"),
  crisis_cleared_at: timestamp("crisis_cleared_at", { withTimezone: true }),
  crisis_cleared_by: integer("crisis_cleared_by").references(() => usersTable.id, { onDelete: "set null" }),
  target_reserve_amount: numeric("target_reserve_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  reserved_balance: numeric("reserved_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  presence_radius_km: doublePrecision("presence_radius_km").notNull().default(35),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("diaspora_hubs_name_unique").on(t.name),
]);

export type DiasporaHub = typeof diasporaHubsTable.$inferSelect;
export type InsertDiasporaHub = typeof diasporaHubsTable.$inferInsert;
