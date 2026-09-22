import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const messageNotificationsTable = pgTable("message_notifications", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  actor_user_id: integer("actor_user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  action_url: text("action_url"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  read_at: timestamp("read_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("message_notifications_user_created_idx").on(table.user_id, table.created_at),
  index("message_notifications_user_read_idx").on(table.user_id, table.read_at),
]);

export type MessageNotification = typeof messageNotificationsTable.$inferSelect;
