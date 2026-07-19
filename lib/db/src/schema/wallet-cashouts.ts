import { pgTable, serial, integer, real, text, timestamp, index, foreignKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Wallet cash-out requests — the missing "last mile" for the benevolence_wallet.
//
// benevolence_wallet accumulates pay-it-forward / pool-fronted / guaranteed-minimum
// earnings, but nothing previously ever moved that balance to Stripe. This table
// is the idempotency ledger for POST /wallet/cashout: one row per attempt, inserted
// BEFORE the Stripe transfer call so the row id can be used as the Stripe
// idempotency key (mirrors the pattern in payout-worker.ts / requests.ts).
export const walletCashoutsTable = pgTable("wallet_cashouts", {
  id: serial("id").primaryKey(),
  // Nullable as of migration 0071 (was notNull under the old, un-guarded
  // CASCADE) so "set null" on account deletion actually has somewhere to go.
  user_id: integer("user_id"),
  amount: real("amount").notNull(),

  // State machine (enforced by application logic, not DB constraint):
  //   pending              → Phase 1 complete: wallet debited, Stripe not yet called
  //   failed               → Stripe transfer failed; retry queued; wallet still debited
  //   completed            → Stripe transfer confirmed; ledger entry written
  //   reversed             → Stripe reversed the transfer; wallet balance restored
  //   permanently_failed   → all retries exhausted, no Stripe transfer found; wallet refunded
  //   reconciliation_required → ambiguous Stripe outcome (timeout); operator must verify
  state: text("state").notNull().default("pending"),

  stripe_account_id: text("stripe_account_id"),
  stripe_transfer_id: text("stripe_transfer_id"),
  notes: text("notes"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("wallet_cashouts_user_id_idx").on(t.user_id),
  index("wallet_cashouts_state_created_idx").on(t.state, t.created_at),
  // onDelete: "set null" (migration 0071) — a cashout is a real payout record;
  // deleting the account it belongs to must not destroy it. Same pattern as
  // diaspora_hub_pledges. Backed up by an app-level delete-blocking check in
  // users.ts, same as pledges.
  foreignKey({ columns: [t.user_id], foreignColumns: [usersTable.id], name: "wallet_cashouts_user_id_fk" }).onDelete("set null"),
]);

export type WalletCashout = typeof walletCashoutsTable.$inferSelect;
export type InsertWalletCashout = typeof walletCashoutsTable.$inferInsert;
