import { pgTable, serial, text, integer, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

// Business governance status values for help_requests.status:
// - pending_owner_approval: staff posted under business; awaiting owner review
export type BusinessRequestStatus = "pending_owner_approval";

// businesses — a registered business entity (pending admin approval before use)
export const businessesTable = pgTable("businesses", {
  id: serial("id").primaryKey(),
  legal_name: text("legal_name").notNull(),
  display_name: text("display_name").notNull(),
  address: text("address"),
  phone: text("phone"),
  stripe_customer_id: text("stripe_customer_id"),
  // approval_status: pending | approved | rejected
  approval_status: text("approval_status").notNull().default("pending"),
  created_by_user_id: integer("created_by_user_id").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("businesses_approval_status_idx").on(t.approval_status),
  index("businesses_created_by_user_id_idx").on(t.created_by_user_id),
]);

export const insertBusinessSchema = createInsertSchema(businessesTable).omit({
  id: true, created_at: true, updated_at: true,
});
export type InsertBusiness = z.infer<typeof insertBusinessSchema>;
export type Business = typeof businessesTable.$inferSelect;

// business_members — many-to-many: users belong to businesses with a role
export const businessMembersTable = pgTable("business_members", {
  id: serial("id").primaryKey(),
  business_id: integer("business_id").notNull(),
  user_id: integer("user_id").notNull(),
  // role: owner | staff
  role: text("role").notNull().default("staff"),
  // status: active | pending | removed
  status: text("status").notNull().default("active"),
  // Per-member spending cap in cents. NULL means no cap.
  spending_cap_cents: integer("spending_cap_cents"),
  invited_at: timestamp("invited_at").defaultNow().notNull(),
  accepted_at: timestamp("accepted_at"),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("business_members_business_id_idx").on(t.business_id),
  index("business_members_user_id_idx").on(t.user_id),
  unique("business_members_unique").on(t.business_id, t.user_id),
]);

export const insertBusinessMemberSchema = createInsertSchema(businessMembersTable).omit({
  id: true, invited_at: true,
});
export type InsertBusinessMember = z.infer<typeof insertBusinessMemberSchema>;
export type BusinessMember = typeof businessMembersTable.$inferSelect;
