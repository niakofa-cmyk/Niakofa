import { pgTable, serial, text, integer, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { civicNeedsTable } from "./civic-needs";

/**
 * civic_invoices — generated when a claimed civic need is completed (FIX 2, migration 0057).
 *
 * amount   = estimated_cost at completion (or admin-negotiated figure)
 * due_date = completed_at + 30 days (NET30)
 * status   : pending → paid
 *
 * NOTE: Full Stripe Connect for institutional payers would plug in here —
 * specifically a Stripe Invoice or PaymentIntent issued to the gov-sponsor's
 * Stripe Customer ID. Today, mark-paid is an admin-triggered manual action
 * via PATCH /civic/needs/:id/invoice/:invoiceId/pay.
 */
export const civicInvoicesTable = pgTable("civic_invoices", {
  id:              serial("id").primaryKey(),
  civic_need_id:   integer("civic_need_id").notNull().references(() => civicNeedsTable.id, { onDelete: "cascade" }),
  amount:          numeric("amount", { precision: 12, scale: 2 }).notNull(),
  due_date:        date("due_date").notNull(),
  // status: pending | paid
  status:          text("status").notNull().default("pending"),
  paid_at:         timestamp("paid_at", { withTimezone: true }),
  paid_by_user_id: integer("paid_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  notes:           text("notes"),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  index("idx_civic_invoices_need_id").on(t.civic_need_id),
  index("idx_civic_invoices_status").on(t.status),
]);

export type CivicInvoice = typeof civicInvoicesTable.$inferSelect;
export type InsertCivicInvoice = typeof civicInvoicesTable.$inferInsert;
