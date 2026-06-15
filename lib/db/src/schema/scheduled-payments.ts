import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

export const scheduledPaymentsTable = pgTable("scheduled_payments", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  request_id: integer("request_id").notNull(),
  amount: real("amount").notNull(),
  scheduled_date: timestamp("scheduled_date").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type ScheduledPayment = typeof scheduledPaymentsTable.$inferSelect;
export type InsertScheduledPayment = typeof scheduledPaymentsTable.$inferInsert;
