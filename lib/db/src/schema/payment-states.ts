import { pgTable, serial, integer, numeric, text, timestamp, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// Payment state machine for every financial transaction in the platform.
// States: unpaid → authorized → escrowed → pending_contribution / sponsored → completed
// Failure paths: authorized → disputed / failed
export const paymentStateEnum = pgEnum("payment_state", [
  "unpaid", "authorized", "escrowed", "pending_contribution",
  "partially_repaid", "sponsored", "completed", "disputed", "failed",
]);

export const paymentTransactionPaymentTypeEnum = pgEnum("payment_transaction_payment_type", [
  "immediate", "pay_it_forward", "goodwill",
]);

export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  request_id: integer("request_id").notNull(),
  helper_id: integer("helper_id").references(() => usersTable.id, { onDelete: "set null" }),
  requester_id: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // numeric(10,2) instead of real (float32) — avoids floating-point rounding
  // error accumulating across repeated SQL-side increments (e.g. wallet/
  // pledge balance updates done via `sql\`${col} + ${amount}\``).
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),

  // Current payment state
  state: paymentStateEnum("state").notNull().default("unpaid"),

  payment_type: paymentTransactionPaymentTypeEnum("payment_type").notNull().default("pay_it_forward"),

  // Stripe identifiers (nullable until Stripe is configured and payment initiated)
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_transfer_id: text("stripe_transfer_id"),
  stripe_charge_id: text("stripe_charge_id"),

  // Amount already paid back (for pay_it_forward partial repayments)
  amount_repaid: numeric("amount_repaid", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),

  // Optional sponsor reference (county pool, nonprofit, etc.)
  sponsored_by: text("sponsored_by"),

  notes: text("notes"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  // CRIT-005: prevent a duplicate "completed" payout row for the same
  // request_id — the retry worker uses onConflictDoNothing() against this
  // constraint to guarantee at-most-one completed payout per request.
  uniqueIndex("payment_transactions_one_completed_per_request")
    .on(t.request_id)
    .where(sql`${t.state} = 'completed'`),
]);

export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
export type InsertPaymentTransaction = typeof paymentTransactionsTable.$inferInsert;

// Mirrors paymentStateEnum above — kept as a named export since other files
// (e.g. labels) reference the PaymentState union directly.
export type PaymentState =
  | "unpaid"
  | "authorized"
  | "escrowed"
  | "pending_contribution"
  | "partially_repaid"
  | "sponsored"
  | "completed"
  | "disputed"
  | "failed";

export const PAYMENT_STATE_LABELS: Record<PaymentState, string> = {
  unpaid: "Unpaid",
  authorized: "Authorized",
  escrowed: "Held in Escrow",
  pending_contribution: "Awaiting Pay-Forward",
  partially_repaid: "Partially Repaid",
  sponsored: "Community Sponsored",
  completed: "Completed",
  disputed: "Disputed",
  failed: "Failed",
};
