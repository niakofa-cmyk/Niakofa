import { sql } from "drizzle-orm";
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex, real, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Local Exchange deliberately stores only a coarse pickup area. Exact
 * addresses, phone numbers, email addresses, and payment fields do not belong
 * in this milestone.
 */
export const exchangeListingsTable = pgTable("exchange_listings", {
  id: serial("id").primaryKey(),
  seller_id: integer("seller_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  listing_type: text("listing_type").notNull().default("offer"),
  resource_type: text("resource_type").notNull().default("goods"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("other"),
  condition: text("condition").notNull().default("good"),
  neighborhood: text("neighborhood").notNull(),
  pickup_notes: text("pickup_notes"),
  // Privacy-rounded coordinates used only for server-side local matching.
  // These are never returned by the Exchange API.
  latitude: real("latitude"),
  longitude: real("longitude"),
  status: text("status").notNull().default("active"),
  moderation_status: text("moderation_status").notNull().default("approved"),
  moderation_reason: text("moderation_reason"),
  archived_at: timestamp("archived_at", { withTimezone: true }),
  archive_reason: text("archive_reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exchangePickupRequestsTable = pgTable("exchange_pickup_requests", {
  id: serial("id").primaryKey(),
  listing_id: integer("listing_id").notNull().references(() => exchangeListingsTable.id, { onDelete: "restrict" }),
  buyer_id: integer("buyer_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  note: text("note").notNull(),
  pickup_area: text("pickup_area").notNull(),
  proposed_window: text("proposed_window").notNull(),
  status: text("status").notNull().default("requested"),
  buyer_confirmed_at: timestamp("buyer_confirmed_at", { withTimezone: true }),
  seller_confirmed_at: timestamp("seller_confirmed_at", { withTimezone: true }),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("exchange_pickup_requests_listing_idx").on(table.listing_id, table.created_at),
  index("exchange_pickup_requests_buyer_idx").on(table.buyer_id, table.updated_at),
  uniqueIndex("exchange_pickup_requests_one_active_per_buyer_listing_idx")
    .on(table.listing_id, table.buyer_id)
    .where(sql`${table.status} IN ('requested', 'accepted')`),
]);

export type ExchangeListing = typeof exchangeListingsTable.$inferSelect;
export type ExchangePickupRequest = typeof exchangePickupRequestsTable.$inferSelect;

/**
 * Idempotency ledger for the weekly Exchange digest. Keeping this in Postgres
 * makes delivery deduplication safe across restarts and multiple API instances.
 */
export const exchangeDigestDeliveriesTable = pgTable("exchange_digest_deliveries", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  week_key: text("week_key").notNull(),
  listing_count: integer("listing_count").notNull().default(0),
  sent_at: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  delivered: boolean("delivered").notNull().default(false),
}, (table) => [
  uniqueIndex("exchange_digest_deliveries_user_week_idx").on(table.user_id, table.week_key),
  index("exchange_digest_deliveries_sent_idx").on(table.sent_at),
]);

export type ExchangeDigestDelivery = typeof exchangeDigestDeliveriesTable.$inferSelect;