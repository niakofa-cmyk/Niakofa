import { pgTable, serial, integer, real, text, timestamp, index } from "drizzle-orm/pg-core";

// Wallet cash-out requests — the missing "last mile" for the benevolence_wallet.
//
// benevolence_wallet accumulates pay-it-forward / pool-fronted / guaranteed-minimum
// earnings, but nothing previously ever moved that balance to Stripe. This table
// is the idempotency ledger for POST /wallet/cashout: one row per attempt, inserted
// BEFORE the Stripe transfer call so the row id can be used as the Stripe
// idempotency key (mirrors the pattern in payout-worker.ts / requests.ts).
export const walletCashoutsTable = pgTable("wallet_cashouts", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  amount: real("amount").notNull(),

  // pending -> completed | failed | reversed
  state: text("state").notNull().default("pending"),

  stripe_account_id: text("stripe_account_id"),
  stripe_transfer_id: text("stripe_transfer_id"),
  notes: text("notes"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("wallet_cashouts_user_id_idx").on(t.user_id),
]);

export type WalletCashout = typeof walletCashoutsTable.$inferSelect;
export type InsertWalletCashout = typeof walletCashoutsTable.$inferInsert;
