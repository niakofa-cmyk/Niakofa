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
  listing_id: integer("listing_id").notNull().references(() => exchangeListingsTable.id, { onDelete: "cascade" }),
  author_user_id: integer("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  community_id: integer("community_id").references(() => communitiesTable.id, { onDelete: "set null" }),
  caption: text("caption"),
  status: text("status").notNull().default("draft"),
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

export type ExchangeSpark = typeof exchangeSparksTable.$inferSelect;
export type NewExchangeSpark = typeof exchangeSparksTable.$inferInsert;