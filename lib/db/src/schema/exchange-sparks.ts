import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { communitiesTable } from "./communities";
import { exchangeListingsTable } from "./exchange";
import { usersTable } from "./users";

/**
 * Exchange Sparks are durable listing-linked media posts. They deliberately
 * use a separate record from ephemeral Community Stories so legacy Story
 * expiry, moderation, and cleanup paths cannot remove or expose them.
 */
export const exchangeSparksTable = pgTable("exchange_sparks", {
  id: serial("id").primaryKey(),
  // A hard listing delete must be blocked until Spark media cleanup has
  // completed; withdrawal/archival remains the supported product lifecycle.
  listing_id: integer("listing_id").notNull().references(() => exchangeListingsTable.id, { onDelete: "restrict" }),
  author_user_id: integer("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  community_id: integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  caption: text("caption"),
  status: text("status").notNull().default("draft"),
  moderation_reason: text("moderation_reason"),
  moderation_reviewed_by: integer("moderation_reviewed_by").references(() => usersTable.id, { onDelete: "restrict" }),
  moderation_reviewed_at: timestamp("moderation_reviewed_at", { withTimezone: true }),
  draft_expires_at: timestamp("draft_expires_at", { withTimezone: true }).notNull()
    .default(sql`(now() + interval '24 hours')`),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("exchange_sparks_listing_created_idx").on(table.listing_id, table.created_at),
  index("exchange_sparks_author_created_idx").on(table.author_user_id, table.created_at),
  index("exchange_sparks_status_created_idx").on(table.status, table.created_at),
  index("exchange_sparks_draft_expiry_idx").on(table.status, table.draft_expires_at),
]);

export const exchangeSparkModerationHistoryTable = pgTable("exchange_spark_moderation_history", {
  id: serial("id").primaryKey(),
  // Intentionally not an FK: moderation history must survive Spark media cleanup.
  spark_id: integer("spark_id").notNull(),
  moderator_id: integer("moderator_id").notNull().references(() => usersTable.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previous_status: text("previous_status").notNull(),
  next_status: text("next_status").notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("exchange_spark_moderation_history_spark_idx").on(table.spark_id, table.created_at),
]);

export type ExchangeSpark = typeof exchangeSparksTable.$inferSelect;
export type NewExchangeSpark = typeof exchangeSparksTable.$inferInsert;