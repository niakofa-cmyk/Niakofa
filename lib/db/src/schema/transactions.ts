import { pgTable, serial, text, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  request_id: integer("request_id"),
  type: text("type").notNull(),
  amount: real("amount").notNull().default(0),
  description: text("description"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("transactions_user_id_idx").on(t.user_id),
  index("transactions_request_id_idx").on(t.request_id),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, created_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
