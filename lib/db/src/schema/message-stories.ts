import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const messageStoriesTable = pgTable("message_stories", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  body: text("body"),
  media_url: text("media_url"),
  media_type: text("media_type"),
  status: text("status").notNull().default("published"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  index("message_stories_user_expires_idx").on(table.user_id, table.expires_at),
  index("message_stories_status_expires_idx").on(table.status, table.expires_at),
]);

export type MessageStory = typeof messageStoriesTable.$inferSelect;
