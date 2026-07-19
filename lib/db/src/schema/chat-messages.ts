import { pgTable, serial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { requestsTable } from "./requests";
import { usersTable } from "./users";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  // onDelete: "cascade" — a request's chat thread has no meaning once the
  // request itself is gone (migration 0020).
  request_id: integer("request_id").notNull().references(() => requestsTable.id, { onDelete: "cascade" }),
  // onDelete: "set null" (migration 0075) — was "cascade" (migration 0020),
  // which meant deleting a user erased the OTHER participant's conversation
  // history too. A message with a null sender still renders (sender_name/
  // avatar come from a leftJoin and already tolerate a missing user row);
  // the request_id cascade above still cleans up the whole thread once the
  // request itself is deleted.
  sender_id: integer("sender_id").references(() => usersTable.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  sent_at: timestamp("sent_at").defaultNow().notNull(),
  read_at: timestamp("read_at"),
}, (t) => [
  index("chat_messages_request_id_idx").on(t.request_id),
]);

export type ChatMessage = typeof chatMessagesTable.$inferSelect;
