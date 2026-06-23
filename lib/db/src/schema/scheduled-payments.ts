import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { requestsTable } from "./requests";

export const scheduledPaymentsTable = pgTable("scheduled_payments", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // HIGH-005: FK added — previously request_id had no .references(), so a
  // scheduled payment could point at a deleted request forever, and the
  // pledge-reconciliation worker's join would silently return no rows for
  // it instead of surfacing the now-orphaned payment.
  request_id: integer("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
  scheduled_date: timestamp("scheduled_date").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type ScheduledPayment = typeof scheduledPaymentsTable.$inferSelect;
export type InsertScheduledPayment = typeof scheduledPaymentsTable.$inferInsert;
