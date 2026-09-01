import { pgTable, serial, text, real, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * community_pool_ledger — the funded community pool's append-only ledger.
 *
 * The pool fronts helper payments immediately when a pay-it-forward request
 * completes, so helpers never carry the risk of a requester paying late (or
 * never). The requester's later repayment replenishes the pool instead of
 * paying the helper directly. The pool also funds a guaranteed minimum per
 * completed task (goodwill tasks and underfunded pay-it-forward tasks).
 *
 * Pool balance = SUM(amount). Signed amounts:
 *   positive = money INTO the pool, negative = money OUT of the pool.
 *
 * entry_type values:
 *   sponsor_contribution — a sponsor (individual/business/county/grant) funded the pool
 *   helper_front         — pool fronted a helper's pay-it-forward amount at completion
 *   pledge_repayment     — requester repaid a fronted pledge; money returns to the pool
 *   guaranteed_minimum   — pool paid the per-task minimum "thank you" to a helper
 *   adjustment           — admin correction (audited via notes)
 */
export const communityPoolLedgerTable = pgTable("community_pool_ledger", {
  id: serial("id").primaryKey(),
  entry_type: text("entry_type").notNull(),
  amount: real("amount").notNull(),
  request_id: integer("request_id"),
  user_id: integer("user_id"),
  payment_transaction_id: integer("payment_transaction_id"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  notes: text("notes"),
  // migration 0030: optional link to the government sponsor that funded the pool
  government_sponsor_id: integer("government_sponsor_id"),
  // migration 0047: community scope — NULL = global/Tarrant County bucket
  community_id: integer("community_id"),
  // migration 0057: hub-scoped ring-fencing — NULL = unrestricted/global pool entry.
  // When set, this entry's funds are reserved for requests tagged to the same hub_id.
  hub_id: integer("hub_id"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type CommunityPoolLedgerEntry = typeof communityPoolLedgerTable.$inferSelect;
export type NewCommunityPoolLedgerEntry = typeof communityPoolLedgerTable.$inferInsert;

/**
 * community_pool_financial_events — the Stripe settlement record attached to
 * a spendable pool ledger entry.
 *
 * The pool ledger amount is the settled net amount. This table preserves the
 * member's gross contribution and every processor/Climate deduction separately
 * so public balances and financial reconciliation cannot confuse the two.
 */
export const communityPoolFinancialEventsTable = pgTable("community_pool_financial_events", {
  id: serial("id").primaryKey(),
  community_pool_ledger_id: integer("community_pool_ledger_id").notNull(),
  user_id: integer("user_id"),
  community_id: integer("community_id"),
  stripe_payment_intent_id: text("stripe_payment_intent_id"),
  stripe_charge_id: text("stripe_charge_id"),
  stripe_balance_transaction_id: text("stripe_balance_transaction_id"),
  stripe_climate_transaction_id: text("stripe_climate_transaction_id"),
  gross_amount_cents: integer("gross_amount_cents").notNull(),
  stripe_fee_cents: integer("stripe_fee_cents").notNull().default(0),
  climate_contribution_cents: integer("climate_contribution_cents").notNull().default(0),
  net_amount_cents: integer("net_amount_cents").notNull(),
  currency: text("currency").notNull().default("usd"),
  // Track A: automatic provider verification. This answers whether Stripe's
  // records were independently verified; it is never an operator approval.
  stripe_verification_status: text("stripe_verification_status").notNull().default("unverified"),
  stripe_verified_at: timestamp("stripe_verified_at", { withTimezone: true }),
  stripe_verification_error: text("stripe_verification_error"),
  settlement_status: text("settlement_status").notNull().default("pending"),
  available_on: timestamp("available_on", { withTimezone: true }),
  paid_out_at: timestamp("paid_out_at", { withTimezone: true }),
  // Track B: explicit operator confirmation that Niakofa released the funds.
  paid_out_by: integer("paid_out_by"),
  paid_out_reference: text("paid_out_reference"),
  paid_out_note: text("paid_out_note"),
  stripe_livemode: boolean("stripe_livemode").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type CommunityPoolFinancialEvent = typeof communityPoolFinancialEventsTable.$inferSelect;
export type NewCommunityPoolFinancialEvent = typeof communityPoolFinancialEventsTable.$inferInsert;

/** Immutable, insert-only audit trail for operator payout confirmations. */
export const communityPoolFinancialAuditEventsTable = pgTable("community_pool_financial_audit_events", {
  id: serial("id").primaryKey(),
  financial_event_id: integer("financial_event_id").notNull(),
  action: text("action").notNull(),
  actor_user_id: integer("actor_user_id").notNull(),
  reference: text("reference"),
  note: text("note"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type CommunityPoolFinancialAuditEvent = typeof communityPoolFinancialAuditEventsTable.$inferSelect;
export type NewCommunityPoolFinancialAuditEvent = typeof communityPoolFinancialAuditEventsTable.$inferInsert;

/**
 * pool_pending_minimums — guaranteed minimums the pool COULDN'T pay because
 * the balance ran dry. A backfill worker retries these (FIFO) whenever the
 * pool is replenished, so no helper silently loses their guarantee.
 *
 * status: pending | paid | cancelled
 */
export const poolPendingMinimumsTable = pgTable("pool_pending_minimums", {
  id: serial("id").primaryKey(),
  request_id: integer("request_id").notNull(),
  helper_id: integer("helper_id").notNull(),
  amount: real("amount").notNull(),
  request_title: text("request_title").notNull().default(""),
  status: text("status").notNull().default("pending"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
  paid_at: timestamp("paid_at", { withTimezone: true }),
});

export type PoolPendingMinimum = typeof poolPendingMinimumsTable.$inferSelect;
export type NewPoolPendingMinimum = typeof poolPendingMinimumsTable.$inferInsert;
