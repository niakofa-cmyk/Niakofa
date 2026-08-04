import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

// Payment state machine for every financial transaction in the platform.
// States: unpaid → authorized → escrowed → pending_contribution / sponsored → completed
// Failure paths: authorized → disputed / failed
export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  request_id: integer("request_id").notNull(),
  helper_id: integer("helper_id"),
  requester_id: integer("requester_id").notNull(),
  amount: real("amount").notNull().default(0),

  // Current payment state
  // unpaid | authorized | escrowed | pending_contribution | partially_repaid | sponsored | completed | disputed | failed
  state: text("state").notNull().default("unpaid"),

  // immediate | pay_it_forward | goodwill
  payment_type: text("payment_type").notNull().default("pay_it_forward"),

  // Stripe identifiers (nullable until Stripe is configured and payment initiated)
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_transfer_id: text("stripe_transfer_id"),
  stripe_charge_id: text("stripe_charge_id"),

  // Amount already paid back (for pay_it_forward partial repayments)
  amount_repaid: real("amount_repaid").notNull().default(0),

  // Optional sponsor reference (county pool, nonprofit, etc.)
  sponsored_by: text("sponsored_by"),

  notes: text("notes"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
export type InsertPaymentTransaction = typeof paymentTransactionsTable.$inferInsert;

// All valid payment states as a TypeScript union
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
