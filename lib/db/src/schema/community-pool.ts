import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
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
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type CommunityPoolLedgerEntry = typeof communityPoolLedgerTable.$inferSelect;
export type NewCommunityPoolLedgerEntry = typeof communityPoolLedgerTable.$inferInsert;

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
