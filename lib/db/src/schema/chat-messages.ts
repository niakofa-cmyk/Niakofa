import { pgTable, serial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  request_id: integer("request_id").notNull(),
  sender_id: integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  sent_at: timestamp("sent_at").defaultNow().notNull(),
  read_at: timestamp("read_at"),
}, (t) => [
  index("chat_messages_request_id_idx").on(t.request_id),
]);

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
