import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const scheduledPaymentsTable = pgTable("scheduled_payments", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  request_id: integer("request_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2, mode: "number" }).notNull(),
  scheduled_date: timestamp("scheduled_date").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type ScheduledPayment = typeof scheduledPaymentsTable.$inferSelect;
export type InsertScheduledPayment = typeof scheduledPaymentsTable.$inferInsert;
