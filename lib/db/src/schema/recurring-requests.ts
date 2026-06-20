import { pgTable, serial, integer, text, real, numeric, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recurringRequestsTable = pgTable("recurring_requests", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  payment_type: text("payment_type").notNull().default("goodwill"),
  pay_it_forward_amount: numeric("pay_it_forward_amount", { precision: 10, scale: 2, mode: "number" }),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  neighborhood: text("neighborhood"),
  recurrence: text("recurrence").notNull().default("weekly"),
  day_of_week: integer("day_of_week"),
  time_of_day: text("time_of_day").notNull().default("09:00"),
  next_fire_at: timestamp("next_fire_at").notNull(),
  active: boolean("active").notNull().default(true),
  last_fired_at: timestamp("last_fired_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("recurring_requests_user_id_idx").on(t.user_id),
  index("recurring_requests_next_fire_at_idx").on(t.next_fire_at),
  index("recurring_requests_active_idx").on(t.active),
]);

export const insertRecurringRequestSchema = createInsertSchema(recurringRequestsTable).omit({
  id: true,
  created_at: true,
  last_fired_at: true,
  next_fire_at: true,
});

export type RecurringRequest = typeof recurringRequestsTable.$inferSelect;
export type InsertRecurringRequest = z.infer<typeof insertRecurringRequestSchema>;
