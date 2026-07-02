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
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type CommunityPoolLedgerEntry = typeof communityPoolLedgerTable.$inferSelect;
export type NewCommunityPoolLedgerEntry = typeof communityPoolLedgerTable.$inferInsert;
