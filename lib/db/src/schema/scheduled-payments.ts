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
  // Dedup sentinel: updated each time a push/email reminder is sent for this
  // payment. The scheduler only re-sends when this is NULL or > 24h old,
  // preventing indefinite re-notification for users who intend to pay later.
  last_reminder_sent_at: timestamp("last_reminder_sent_at"),
  // Optional: links this payment to a repayment plan (for installment tracking)
  plan_id: integer("plan_id"),
});

export type ScheduledPayment = typeof scheduledPaymentsTable.$inferSelect;
export type InsertScheduledPayment = typeof scheduledPaymentsTable.$inferInsert;
