import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { diasporaHubsTable } from "./diaspora-hubs";

/**
 * Direct Hub-to-Hub conversations.
 *
 * Hub ids are stored canonically (the lower id in hub_a_id) so retries and
 * two users opening the same pair resolve to one durable thread.
 */
export const diasporaHubConversationsTable = pgTable("diaspora_hub_conversations", {
  id: serial("id").primaryKey(),
  hub_a_id: integer("hub_a_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  hub_b_id: integer("hub_b_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  created_by: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  last_message_at: timestamp("last_message_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("diaspora_hub_conversations_pair_unique").on(t.hub_a_id, t.hub_b_id),
  index("diaspora_hub_conversations_hub_a_idx").on(t.hub_a_id),
  index("diaspora_hub_conversations_hub_b_idx").on(t.hub_b_id),
]);

export const diasporaHubMessagesTable = pgTable("diaspora_hub_messages", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id").notNull().references(() => diasporaHubConversationsTable.id, { onDelete: "cascade" }),
  sender_user_id: integer("sender_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sender_hub_id: integer("sender_hub_id").notNull().references(() => diasporaHubsTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  read_at: timestamp("read_at", { withTimezone: true }),
}, (t) => [
  index("diaspora_hub_messages_conversation_idx").on(t.conversation_id, t.created_at),
  index("diaspora_hub_messages_sender_hub_idx").on(t.sender_hub_id),
]);

export type DiasporaHubConversation = typeof diasporaHubConversationsTable.$inferSelect;
export type DiasporaHubMessage = typeof diasporaHubMessagesTable.$inferSelect;
