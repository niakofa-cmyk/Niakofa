import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const disputesTable = pgTable("disputes", {
  id:            serial("id").primaryKey(),
  request_id:    integer("request_id").notNull(),
  opened_by:     integer("opened_by").notNull(),
  against_user:  integer("against_user"),
  reason:        text("reason").notNull(),
  details:       text("details"),
  status:        text("status").notNull().default("open"),
  resolution:    text("resolution"),
  resolved_by:   integer("resolved_by"),
  resolved_at:   timestamp("resolved_at", { withTimezone: true }),
  created_at:    timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("disputes_status_created_idx").on(t.status, t.created_at),
  index("disputes_opened_by_idx").on(t.opened_by, t.created_at),
]);

export const insertDisputeSchema = createInsertSchema(disputesTable).omit({
  id: true, created_at: true, updated_at: true, resolved_at: true, resolved_by: true, resolution: true, status: true,
}).extend({
  reason: z.string().min(10, "Please describe the issue (min 10 characters)").max(500),
  details: z.string().max(2000).optional(),
  against_user: z.number().int().positive().optional(),
});

export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputesTable.$inferSelect;
