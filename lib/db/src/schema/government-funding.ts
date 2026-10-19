import { pgTable, serial, text, integer, numeric, timestamp, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { governmentSponsorsTable } from "./government-sponsors";
import { usersTable } from "./users";
import { requestsTable } from "./requests";
import { communitiesTable } from "./communities";
import { communityPoolLedgerTable } from "./community-pool";
import { payoutOperationsTable } from "./payout-operations";

/**
 * Public budget authorizations and request-level reservations.
 *
 * Budget and commitment records document authority and request reservations.
 * Separate receipt and transfer-reconciliation tables hold verified cash data.
 */
export const governmentBudgetsTable = pgTable("government_budgets", {
  id: serial("id").primaryKey(),
  government_sponsor_id: integer("government_sponsor_id")
    .notNull()
    .references(() => governmentSponsorsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  fiscal_year: text("fiscal_year").notNull(),
  appropriation_reference: text("appropriation_reference").notNull(),
  authorized_amount: numeric("authorized_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"),
  created_by_user_id: integer("created_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  index("government_budgets_sponsor_status_idx").on(t.government_sponsor_id, t.status),
  uniqueIndex("government_budgets_appropriation_uidx")
    .on(t.government_sponsor_id, t.fiscal_year, t.appropriation_reference),
]);

export const governmentRequestFundingTable = pgTable("government_request_funding", {
  id: serial("id").primaryKey(),
  government_sponsor_id: integer("government_sponsor_id")
    .notNull()
    .references(() => governmentSponsorsTable.id, { onDelete: "restrict" }),
  budget_id: integer("budget_id")
    .notNull()
    .references(() => governmentBudgetsTable.id, { onDelete: "restrict" }),
  request_id: integer("request_id")
    .notNull()
    .references(() => requestsTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("approved"),
  notes: text("notes"),
  approved_by_user_id: integer("approved_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  index("government_request_funding_sponsor_created_idx").on(t.government_sponsor_id, t.created_at),
  index("government_request_funding_budget_status_idx").on(t.budget_id, t.status),
  uniqueIndex("government_request_funding_sponsor_request_uidx").on(t.government_sponsor_id, t.request_id),
]);

/**
 * Confirmed card/bank receipts for a government budget. `status` is advanced
 * only by signed Stripe webhooks; browser confirmation is never receipt proof.
 */
export const governmentBudgetReceiptsTable = pgTable("government_budget_receipts", {
  id: serial("id").primaryKey(),
  government_sponsor_id: integer("government_sponsor_id").notNull()
    .references(() => governmentSponsorsTable.id, { onDelete: "restrict" }),
  budget_id: integer("budget_id").notNull()
    .references(() => governmentBudgetsTable.id, { onDelete: "restrict" }),
  created_by_user_id: integer("created_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  community_id: integer("community_id").notNull()
    .references(() => communitiesTable.id, { onDelete: "restrict" }),
  operation_key: text("operation_key").notNull(),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  community_pool_ledger_id: integer("community_pool_ledger_id")
    .references(() => communityPoolLedgerTable.id, { onDelete: "restrict" }),
  community_pool_financial_event_id: integer("community_pool_financial_event_id"),
  gross_amount_cents: integer("gross_amount_cents").notNull(),
  stripe_fee_cents: integer("stripe_fee_cents").notNull().default(0),
  net_amount_cents: integer("net_amount_cents").notNull().default(0),
  amount_refunded_cents: integer("amount_refunded_cents").notNull().default(0),
  net_refunded_cents: integer("net_refunded_cents").notNull().default(0),
  refund_net_verified: boolean("refund_net_verified").notNull().default(false),
  currency: text("currency").notNull().default("usd"),
  settlement_status: text("settlement_status").notNull().default("pending"),
  status: text("status").notNull().default("creating"),
  stripe_livemode: boolean("stripe_livemode").notNull().default(false),
  succeeded_at: timestamp("succeeded_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  uniqueIndex("government_budget_receipts_sponsor_operation_uidx").on(t.government_sponsor_id, t.operation_key),
  uniqueIndex("government_budget_receipts_payment_intent_uidx").on(t.stripe_payment_intent_id),
  index("government_budget_receipts_budget_status_idx").on(t.budget_id, t.status, t.created_at),
]);

/** A request's existing helper transfer, linked to its public allocations. */
export const governmentFundingTransferLinksTable = pgTable("government_funding_transfer_links", {
  id: serial("id").primaryKey(),
  request_funding_id: integer("request_funding_id").notNull()
    .references(() => governmentRequestFundingTable.id, { onDelete: "restrict" }),
  payout_operation_id: integer("payout_operation_id").notNull()
    .references(() => payoutOperationsTable.id, { onDelete: "restrict" }),
  stripe_transfer_id: text("stripe_transfer_id").notNull(),
  stripe_destination_payment_id: text("stripe_destination_payment_id"),
  stripe_account_id: text("stripe_account_id").notNull(),
  linked_amount_cents: integer("linked_amount_cents").notNull(),
  transfer_amount_cents: integer("transfer_amount_cents").notNull(),
  reversed_amount_cents: integer("reversed_amount_cents").notNull().default(0),
  stripe_livemode: boolean("stripe_livemode").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  uniqueIndex("government_funding_transfer_link_uidx").on(t.request_funding_id, t.stripe_transfer_id),
  index("government_funding_transfer_account_idx").on(t.stripe_account_id, t.stripe_transfer_id),
]);

/** Connected-account bank payout event, recorded from Stripe-signed events. */
export const governmentConnectedPayoutsTable = pgTable("government_connected_payouts", {
  id: serial("id").primaryKey(),
  stripe_account_id: text("stripe_account_id").notNull(),
  stripe_payout_id: text("stripe_payout_id").notNull(),
  amount_cents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  arrival_date: timestamp("arrival_date", { withTimezone: true }),
  stripe_event_id: text("stripe_event_id").notNull(),
  stripe_livemode: boolean("stripe_livemode").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  uniqueIndex("government_connected_payout_account_uidx").on(t.stripe_account_id, t.stripe_payout_id),
  index("government_connected_payout_status_idx").on(t.status, t.updated_at),
]);

/** Exact source-ID mapping; no amount-only guesses are made. */
export const governmentTransferBankPayoutsTable = pgTable("government_transfer_bank_payouts", {
  id: serial("id").primaryKey(),
  transfer_link_id: integer("transfer_link_id").notNull()
    .references(() => governmentFundingTransferLinksTable.id, { onDelete: "restrict" }),
  connected_payout_id: integer("connected_payout_id").notNull()
    .references(() => governmentConnectedPayoutsTable.id, { onDelete: "restrict" }),
  stripe_balance_transaction_id: text("stripe_balance_transaction_id").notNull(),
  linked_amount_cents: integer("linked_amount_cents").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  uniqueIndex("government_transfer_bank_payout_uidx").on(t.transfer_link_id, t.connected_payout_id),
  index("government_transfer_bank_payout_payout_idx").on(t.connected_payout_id),
]);

export type GovernmentBudget = typeof governmentBudgetsTable.$inferSelect;
export type GovernmentRequestFunding = typeof governmentRequestFundingTable.$inferSelect;
