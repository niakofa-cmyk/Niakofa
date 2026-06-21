import { pgTable, serial, text, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  request_id: integer("request_id"),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  description: text("description"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("transactions_user_id_idx").on(t.user_id),
  index("transactions_request_id_idx").on(t.request_id),
]);

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, created_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
