import { integer, index, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const directConversationsTable = pgTable("direct_conversations", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  status: text("status").notNull().default("active"),
});

export const directConversationMembersTable = pgTable("direct_conversation_members", {
  conversation_id: integer("conversation_id")
    .notNull()
    .references(() => directConversationsTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  joined_at: timestamp("joined_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  primaryKey({ columns: [table.conversation_id, table.user_id] }),
  index("direct_conversation_members_user_idx").on(table.user_id),
]);

export const directMessagesTable = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  conversation_id: integer("conversation_id")
    .notNull()
    .references(() => directConversationsTable.id, { onDelete: "cascade" }),
  sender_id: integer("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  read_at: timestamp("read_at", { withTimezone: true }),
}, (table) => [
  index("direct_messages_conversation_created_idx").on(table.conversation_id, table.created_at),
]);

export const directMessageBlocksTable = pgTable("direct_message_blocks", {
  blocker_id: integer("blocker_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  blocked_id: integer("blocked_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  primaryKey({ columns: [table.blocker_id, table.blocked_id] }),
  index("direct_message_blocks_blocked_idx").on(table.blocked_id),
]);

export const directMessageReportsTable = pgTable("direct_message_reports", {
  id: serial("id").primaryKey(),
  reporter_id: integer("reporter_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  conversation_id: integer("conversation_id")
    .notNull()
    .references(() => directConversationsTable.id, { onDelete: "cascade" }),
  message_id: integer("message_id")
    .references(() => directMessagesTable.id, { onDelete: "set null" }),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("open"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  index("direct_message_reports_status_idx").on(table.status, table.created_at),
]);

export type DirectConversation = typeof directConversationsTable.$inferSelect;
export type DirectConversationMember = typeof directConversationMembersTable.$inferSelect;
export type DirectMessage = typeof directMessagesTable.$inferSelect;
export type DirectMessageBlock = typeof directMessageBlocksTable.$inferSelect;
export type DirectMessageReport = typeof directMessageReportsTable.$inferSelect;