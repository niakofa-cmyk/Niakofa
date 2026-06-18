import { pgTable, serial, text, boolean, real, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const requestsTable = pgTable("help_requests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull().default("other"),
  urgency: text("urgency").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  payment_type: text("payment_type").notNull().default("pay_it_forward"),
  requester_id: integer("requester_id").notNull(),
  helper_id: integer("helper_id"),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  neighborhood: text("neighborhood"),
  pay_it_forward_amount: real("pay_it_forward_amount"),
  pledge_amount: real("pledge_amount"),
  pledge_paid: real("pledge_paid").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
  claimed_at: timestamp("claimed_at"),
  en_route_at: timestamp("en_route_at"),
  arrived_at: timestamp("arrived_at"),
  completed_at: timestamp("completed_at"),
}, (t) => [
  index("help_requests_status_idx").on(t.status),
  index("help_requests_requester_id_idx").on(t.requester_id),
  index("help_requests_helper_id_idx").on(t.helper_id),
  index("help_requests_created_at_idx").on(t.created_at),
]);

export const insertRequestSchema = createInsertSchema(requestsTable).omit({
  id: true, created_at: true, claimed_at: true, en_route_at: true, arrived_at: true, completed_at: true,
});
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type HelpRequest = typeof requestsTable.$inferSelect;
