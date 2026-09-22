import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod/v4";

/**
 * government_sponsors — applications from county/government entities to sponsor
 * the Niakofa community pool. Follows the same approval-queue pattern as businesses.
 *
 * Migration: 0029_government_sponsors.sql
 */
export const governmentSponsorsTable = pgTable("government_sponsors", {
  id: serial("id").primaryKey(),
  // Official entity name (e.g. "Tarrant County Health Department")
  entity_name: text("entity_name").notNull(),
  // County/region this entity represents (e.g. "Tarrant", "Dallas", "Harris")
  county: text("county").notNull(),
  // State abbreviation (e.g. "TX")
  state: text("state").notNull(),
  // Optional city
  city: text("city"),
  // Contact details
  contact_name: text("contact_name").notNull(),
  contact_email: text("contact_email").notNull(),
  contact_phone: text("contact_phone"),
  // Optional: a description of the entity and its mission
  description: text("description"),
  // Optional: URL to official entity website
  website_url: text("website_url"),
  // approval_status: pending | approved | rejected
  approval_status: text("approval_status").notNull().default("pending"),
  // Admin notes on approval/rejection
  admin_notes: text("admin_notes"),
  // User who submitted the application (must be a logged-in Niakofa user)
  submitted_by_user_id: integer("submitted_by_user_id").notNull(),
  // When the admin processed the application
  reviewed_at: timestamp("reviewed_at"),
  reviewed_by_user_id: integer("reviewed_by_user_id"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("gov_sponsors_approval_status_idx").on(t.approval_status),
  index("gov_sponsors_submitted_by_idx").on(t.submitted_by_user_id),
  index("gov_sponsors_county_state_idx").on(t.county, t.state),
]);

export const insertGovernmentSponsorSchema = createInsertSchema(governmentSponsorsTable).omit({
  id: true, created_at: true, updated_at: true,
  reviewed_at: true, reviewed_by_user_id: true,
});
export type InsertGovernmentSponsor = z.infer<typeof insertGovernmentSponsorSchema>;
export type GovernmentSponsor = typeof governmentSponsorsTable.$inferSelect;
