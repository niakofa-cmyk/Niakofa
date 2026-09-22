import { integer, pgTable, primaryKey, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const messageReadStatesTable = pgTable("message_read_states", {
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conversation_kind: text("conversation_kind").notNull(),
  conversation_id: integer("conversation_id").notNull(),
  last_read_message_id: integer("last_read_message_id"),
  last_read_at: timestamp("last_read_at", { withTimezone: true }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.conversation_kind, table.conversation_id] }),
  index("message_read_states_conversation_idx").on(table.conversation_kind, table.conversation_id, table.user_id),
]);

export type MessageReadState = typeof messageReadStatesTable.$inferSelect;
