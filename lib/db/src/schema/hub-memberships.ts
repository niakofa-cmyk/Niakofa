import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { diasporaHubsTable } from "./diaspora-hubs";

export const hubMembershipsTable = pgTable("hub_memberships", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  hub_id: integer("hub_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("requested"),
  role: text("role").notNull().default("member"),
  requested_at: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  approved_at: timestamp("approved_at", { withTimezone: true }),
  approved_by: integer("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_memberships_user_hub_unique").on(t.user_id, t.hub_id),
  index("hub_memberships_hub_status_idx").on(t.hub_id, t.status),
  index("hub_memberships_user_status_idx").on(t.user_id, t.status),
]);

export type HubMembership = typeof hubMembershipsTable.$inferSelect;
export type NewHubMembership = typeof hubMembershipsTable.$inferInsert;