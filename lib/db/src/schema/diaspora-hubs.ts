import { pgTable, serial, integer, text, boolean, timestamp, doublePrecision, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { communitiesTable } from "./communities";

// Diaspora Globe hub cities. The original 10 curated cities ship as
// `is_seed = true` rows (see migration 0053); anything added after that is
// either an admin/community-proposed hub (status="pending_review" until
// approved) or a community claiming one of the seed pins as their own via
// `community_id`.
export const diasporaHubsTable = pgTable("diaspora_hubs", {
  id:           serial("id").primaryKey(),
  name:         text("name").notNull(),
  region_label: text("region_label").notNull(),
  lat:          doublePrecision("lat").notNull(),
  lng:          doublePrecision("lng").notNull(),
  tag:          text("tag").notNull().default("us"), // home|us|carib|latino|africa|europe (loose — UI-driven, not DB-enforced)
  note:         text("note"),
  community_id: integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  is_seed:      boolean("is_seed").notNull().default(false),
  status:       text("status").notNull().default("approved"), // pending_review | approved | rejected
  created_by:   integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  // Crisis-lit hub flow: a hub can be flagged in crisis by an approved hub
  // leader or admin, broadcast to the whole globe, and cleared the same way.
  is_crisis:          boolean("is_crisis").notNull().default(false),
  crisis_message:     text("crisis_message"),
  crisis_declared_at: timestamp("crisis_declared_at", { withTimezone: true }),
  crisis_declared_by: integer("crisis_declared_by").references(() => usersTable.id, { onDelete: "set null" }),
  // Migration 0056: audit trail for clearing a crisis — this is the one
  // action that makes a real emergency disappear from the map, so who did
  // it (and why) must be recorded.
  crisis_resolved_note: text("crisis_resolved_note"),
  crisis_cleared_at:    timestamp("crisis_cleared_at", { withTimezone: true }),
  crisis_cleared_by:    integer("crisis_cleared_by").references(() => usersTable.id, { onDelete: "set null" }),
  // Migration 0057: per-hub pledge ring-fencing. target_reserve_amount is an
  // advisory total this hub's pool is meant to hold (set by a hub leader /
  // admin; 0 = no specific target, purely ring-fenced). reserved_balance is a
  // materialised running total of hub-tagged ledger credits minus debits —
  // kept as a convenience column; the authoritative figure is always the live
  // SUM query in getHubReservedBalance(), updated transactionally alongside
  // every hub-tagged ledger write.
  target_reserve_amount: numeric("target_reserve_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  reserved_balance:      numeric("reserved_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("diaspora_hubs_name_unique").on(t.name),
]);

export type DiasporaHub = typeof diasporaHubsTable.$inferSelect;
export type InsertDiasporaHub = typeof diasporaHubsTable.$inferInsert;
