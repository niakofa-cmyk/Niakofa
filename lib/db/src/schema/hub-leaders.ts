import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { diasporaHubsTable } from "./diaspora-hubs";

// Hub community leaders — a "manage_tasks" tier permission scoped to a single
// diaspora hub, not full platform admin. Any authenticated user (a resident
// tied to that hub) can apply; an existing approved leader OR a platform
// admin approves. This fills the seam left by /griot/hubs/:id/claim being
// admin-only with no community-scoped role.
export const hubCommunityLeadersTable = pgTable("hub_community_leaders", {
  id:          serial("id").primaryKey(),
  hub_id:      integer("hub_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  user_id:     integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role:        text("role").notNull().default("leader"), // leader | resident
  approved:    boolean("approved").notNull().default(false),
  approved_by: integer("approved_by").references(() => usersTable.id, { onDelete: "set null" }),
  approved_at: timestamp("approved_at", { withTimezone: true }),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_community_leaders_hub_user_unique").on(t.hub_id, t.user_id),
]);

export type HubCommunityLeader = typeof hubCommunityLeadersTable.$inferSelect;
export type InsertHubCommunityLeader = typeof hubCommunityLeadersTable.$inferInsert;
