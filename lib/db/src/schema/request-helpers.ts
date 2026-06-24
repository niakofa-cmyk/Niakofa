import { pgTable, serial, integer, timestamp, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { requestsTable } from "./requests";

/**
 * request_helpers — Help Chain membership.
 *
 * One row per (request, co-helper) pair. The primary helper on the request
 * (help_requests.helper_id) is NOT duplicated here — this table tracks
 * additional helpers who join to coordinate, not the official claimant.
 *
 * Uniqueness: a helper can only be in a chain once at a time. Leaving and
 * re-joining creates a new row (the old one is deleted on leave).
 */
export const requestHelpersTable = pgTable(
  "request_helpers",
  {
    id:         serial("id").primaryKey(),
    request_id: integer("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
    helper_id:  integer("helper_id").notNull().references(() => usersTable.id,    { onDelete: "cascade" }),
    joined_at:  timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique("request_helpers_unique").on(t.request_id, t.helper_id),
    index("request_helpers_request_id_idx").on(t.request_id),
    index("request_helpers_helper_id_idx").on(t.helper_id),
  ]
);

export type RequestHelper  = typeof requestHelpersTable.$inferSelect;
export type InsertRequestHelper = typeof requestHelpersTable.$inferInsert;
