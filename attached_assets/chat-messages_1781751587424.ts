import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  request_id: integer("request_id").notNull(),
  sender_id: integer("sender_id").notNull(),
  content: text("content").notNull(),
  sent_at: timestamp("sent_at").defaultNow().notNull(),
  read_at: timestamp("read_at"),
});

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
