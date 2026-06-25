import { pgTable, serial, text, boolean, real, numeric, integer, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Enum values mirror the generated OpenAPI types exactly (HelpRequestStatus,
// HelpRequestUrgency, HelpRequestCategory, HelpRequestPaymentType in
// lib/api-zod/src/generated/types/) — keep both in sync if either changes.
export const requestStatusEnum = pgEnum("help_request_status", [
  "open", "claimed", "en_route", "arrived", "completed", "pay_it_forward_pending", "cancelled", "expired",
]);
export const requestUrgencyEnum = pgEnum("help_request_urgency", [
  "low", "medium", "high", "emergency",
]);
export const requestCategoryEnum = pgEnum("help_request_category", [
  "groceries", "transportation", "errands", "home_repair", "medical", "emergency",
  "other", "stock_shelves", "event_setup", "delivery_run", "tech_support",
]);
export const requestPaymentTypeEnum = pgEnum("help_request_payment_type", [
  "immediate", "pay_it_forward", "goodwill",
]);

export const requestsTable = pgTable("help_requests", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: requestCategoryEnum("category").notNull().default("other"),
  urgency: requestUrgencyEnum("urgency").notNull().default("medium"),
  status: requestStatusEnum("status").notNull().default("open"),
  payment_type: requestPaymentTypeEnum("payment_type").notNull().default("pay_it_forward"),
  requester_id: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  helper_id: integer("helper_id").references(() => usersTable.id, { onDelete: "set null" }),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  neighborhood: text("neighborhood"),
  // Currency fields use numeric(10,2) instead of real (float32) to avoid
  // floating-point rounding error accumulating across transactions.
  // LOW-008: despite the name, this column holds the payment amount for
  // BOTH payment_type === "pay_it_forward" (pledge system) AND
  // payment_type === "immediate" (direct pay) — the "complete" handler in
  // requests.ts checks this same field to decide whether to fire a Stripe
  // payout regardless of which payment_type the request used. Renaming the
  // column is a real migration touching every read/write site in
  // api-server and the pay-it-forward frontend (wallet, request-new,
  // request-detail) — flagged for a dedicated pass with sign-off rather
  // than folded into this fix batch.
  pay_it_forward_amount: numeric("pay_it_forward_amount", { precision: 10, scale: 2, mode: "number" }),
  pledge_amount: numeric("pledge_amount", { precision: 10, scale: 2, mode: "number" }),
  pledge_paid: numeric("pledge_paid", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
  claimed_at: timestamp("claimed_at"),
  en_route_at: timestamp("en_route_at"),
  arrived_at: timestamp("arrived_at"),
  completed_at: timestamp("completed_at"),
  cancelled_at: timestamp("cancelled_at"),
  // Set by nia-checkin-worker.ts once the 24h follow-up has been sent for this
  // request, so it never gets sent twice. Added in migration 0013 — see
  // CLAUDE.md incident log for why this was missing for a while.
  nia_checkin_sent_at: timestamp("nia_checkin_sent_at", { withTimezone: true }),
  // Phase 9D: Analytics — track voice-activated requests and which language
  voice_activated: boolean("voice_activated").notNull().default(false),
  voice_language: text("voice_language"),
}, (t) => [
  index("help_requests_status_idx").on(t.status),
  index("help_requests_requester_id_idx").on(t.requester_id),
  index("help_requests_helper_id_idx").on(t.helper_id),
  index("help_requests_created_at_idx").on(t.created_at),
  index("help_requests_lat_lng_idx").on(t.lat, t.lng),
]);

export const insertRequestSchema = createInsertSchema(requestsTable).omit({
  id: true, created_at: true, claimed_at: true, en_route_at: true, arrived_at: true, completed_at: true, nia_checkin_sent_at: true,
});
export type InsertRequest = z.infer<typeof insertRequestSchema>;
export type HelpRequest = typeof requestsTable.$inferSelect;
