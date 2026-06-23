import { pgTable, bigserial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const niaConversationsTable = pgTable("nia_conversations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  user_id: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  session_id: text("session_id").notNull(),
  user_message: text("user_message").notNull(),
  nia_response: text("nia_response").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("nia_conversations_session_idx").on(t.session_id),
  index("nia_conversations_created_at_idx").on(t.created_at),
]);

export type NiaConversation = typeof niaConversationsTable.$inferSelect;
