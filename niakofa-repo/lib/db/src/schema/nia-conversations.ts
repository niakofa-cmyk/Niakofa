import { pgTable, bigserial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const niaConversationsTable = pgTable("nia_conversations", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  user_id: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  session_id: text("session_id").notNull(),
  user_message: text("user_message").notNull(),
  nia_response: text("nia_response").notNull(),
  // True when checkSafety() (nia-service/src/lib/safety.ts) flagged this
  // message as crisis-level. Added in migration 0013 so a future
  // crisis-specific follow-up worker has something real to query — there was
  // previously no column recording this at all.
  is_crisis: boolean("is_crisis").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("nia_conversations_session_idx").on(t.session_id),
  index("nia_conversations_created_at_idx").on(t.created_at),
  // Without this, querying a user's Nia history (e.g. profile/history page)
  // does a full table scan; session_id was indexed but user_id was not.
  index("nia_conversations_user_id_idx").on(t.user_id),
  index("nia_conversations_crisis_idx").on(t.user_id, t.created_at),
]);

export type NiaConversation = typeof niaConversationsTable.$inferSelect;
