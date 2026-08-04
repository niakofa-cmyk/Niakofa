import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";

export const repaymentPlansTable = pgTable("repayment_plans", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  request_id: integer("request_id").notNull(),
  plan_type: text("plan_type").notNull().default("installments_2"),
  period: text("period").notNull().default("weeks_2"),
  total_amount: real("total_amount").notNull(),
  installment_count: integer("installment_count").notNull().default(2),
  amount_per_installment: real("amount_per_installment").notNull(),
  status: text("status").notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
});

export type RepaymentPlan = typeof repaymentPlansTable.$inferSelect;
export type InsertRepaymentPlan = typeof repaymentPlansTable.$inferInsert;
