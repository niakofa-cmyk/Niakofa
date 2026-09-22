import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const payoutOperationsTable = pgTable("payout_operations", {
  id: serial("id").primaryKey(),
  operation_key: text("operation_key").notNull(),
  request_id: integer("request_id").notNull(),
  helper_id: integer("helper_id").notNull(),
  requester_id: integer("requester_id").notNull(),
  amount_cents: integer("amount_cents").notNull(),
  platform_fee_cents: integer("platform_fee_cents").notNull(),
  stripe_account_id: text("stripe_account_id").notNull(),
  stripe_transfer_id: text("stripe_transfer_id"),
  state: text("state").notNull().default("claimed"),
  last_attempt: integer("last_attempt").notNull().default(0),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("payout_operations_operation_key_idx").on(t.operation_key),
]);

export type PayoutOperation = typeof payoutOperationsTable.$inferSelect;