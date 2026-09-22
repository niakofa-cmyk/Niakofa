import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Persisted web-push subscriptions.
 *
 * Previously these were stored in a Node.js in-process Map, which meant
 * every server restart (e.g. deploy, crash) silently wiped all subscriptions.
 * This table makes them durable across restarts.
 */
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  // Full subscription object stored as JSON: { endpoint, keys: { p256dh, auth } }
  subscription: jsonb("subscription").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptionsTable.$inferInsert;
