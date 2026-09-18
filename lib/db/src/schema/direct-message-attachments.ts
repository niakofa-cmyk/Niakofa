import { integer, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { directMessagesTable } from "./direct-messages";

export const directMessageAttachmentsTable = pgTable("direct_message_attachments", {
  id: serial("id").primaryKey(),
  message_id: integer("message_id")
    .notNull()
    .references(() => directMessagesTable.id, { onDelete: "cascade" }),
  storage_key: text("storage_key").notNull().unique(),
  mime_type: text("mime_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  original_name: text("original_name"),
  alt_text: text("alt_text"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
}, (table) => [
  index("direct_message_attachments_message_idx").on(table.message_id),
]);

export type DirectMessageAttachment = typeof directMessageAttachmentsTable.$inferSelect;