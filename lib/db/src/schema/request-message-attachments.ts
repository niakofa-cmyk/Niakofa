import { integer, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { chatMessagesTable } from "./chat-messages";
import { mediaAssetsTable } from "./media-assets";

export const requestMessageAttachmentsTable = pgTable("request_message_attachments", {
  id: serial("id").primaryKey(),
  message_id: integer("message_id")
    .notNull()
    .references(() => chatMessagesTable.id, { onDelete: "cascade" }),
  media_asset_id: integer("media_asset_id")
    .references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  storage_key: text("storage_key").notNull().unique(),
  attachment_type: text("attachment_type").notNull().default("file"),
  mime_type: text("mime_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  original_name: text("original_name"),
  alt_text: text("alt_text"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
}, (table) => [
  index("request_message_attachments_message_idx").on(table.message_id),
]);

export type RequestMessageAttachment = typeof requestMessageAttachmentsTable.$inferSelect;