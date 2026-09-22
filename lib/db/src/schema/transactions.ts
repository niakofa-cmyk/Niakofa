import { pgTable, serial, text, real, integer, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  request_id: integer("request_id"),
  type: text("type").notNull(),
  amount: real("amount").notNull().default(0),
  description: text("description"),
  // Stable client operation key for retry-safe money mutations.
  idempotency_key: text("idempotency_key"),
  // Optional links for rich personal History entries backed by the
  // authoritative Community Pool ledger and settlement event.
  related_pool_ledger_id: integer("related_pool_ledger_id"),
  related_financial_event_id: integer("related_financial_event_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("transactions_user_id_idx").on(t.user_id),
  index("transactions_request_id_idx").on(t.request_id),
  index("transactions_related_pool_ledger_id_idx").on(t.related_pool_ledger_id),
  uniqueIndex("transactions_user_id_idempotency_key_idx").on(t.user_id, t.idempotency_key),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, created_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
