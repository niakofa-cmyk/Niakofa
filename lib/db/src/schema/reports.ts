import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const reportTypeEnum = pgEnum("report_type", [
  "suspicious_request",
  "suspicious_helper",
  "fraud",
  "harassment",
  "fake_profile",
  "dangerous_behavior",
  "spam",
  "commercial_pricing",
  "spam_or_solicitation",
  "unsafe_or_harmful",
  "other",
  "sos",
]);

export const reportStatusEnum = pgEnum("report_status", [
  "pending",
  "under_review",
  "resolved_dismissed",
  "resolved_warned",
  "resolved_banned",
]);

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporter_id: integer("reporter_id").notNull(),
  reported_user_id: integer("reported_user_id"),
  reported_request_id: integer("reported_request_id"),
  reported_griot_story_id: integer("reported_griot_story_id"),
  // Exchange reports use a first-class target so duplicate submissions can be
  // rejected atomically instead of parsing the human-readable description.
  reported_exchange_listing_id: integer("reported_exchange_listing_id"),
  type: reportTypeEnum("type").notNull(),
  description: text("description").notNull(),
  status: reportStatusEnum("status").notNull().default("pending"),
  admin_notes: text("admin_notes"),
  reviewed_by: integer("reviewed_by"),
  reviewed_at: timestamp("reviewed_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type Report = typeof reportsTable.$inferSelect;
export type InsertReport = typeof reportsTable.$inferInsert;
