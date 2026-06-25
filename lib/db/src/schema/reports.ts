import { pgTable, serial, integer, text, boolean, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { requestsTable } from "./requests";

export const reportTypeEnum = pgEnum("report_type", [
  "suspicious_request",
  "suspicious_helper",
  "fraud",
  "harassment",
  "fake_profile",
  "dangerous_behavior",
  "spam",
  "sos",
  "other",
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
  reporter_id: integer("reporter_id").references(() => usersTable.id, { onDelete: "set null" }), // nullable so the report survives if the reporter's account is later deleted
  reported_user_id: integer("reported_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  // FK with set null: a report survives if the request it referenced is deleted.
  reported_request_id: integer("reported_request_id").references(() => requestsTable.id, { onDelete: "set null" }),
  type: reportTypeEnum("type").notNull(),
  description: text("description").notNull(),
  status: reportStatusEnum("status").notNull().default("pending"),
  admin_notes: text("admin_notes"),
  // FK with set null: the report's review history survives if the admin account is deleted.
  reviewed_by: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("reports_reporter_id_idx").on(t.reporter_id),
  index("reports_reported_user_id_idx").on(t.reported_user_id),
  index("reports_reported_request_id_idx").on(t.reported_request_id),
  index("reports_status_idx").on(t.status),
  index("reports_created_at_idx").on(t.created_at),
]);

export type Report = typeof reportsTable.$inferSelect;
export type InsertReport = typeof reportsTable.$inferInsert;
