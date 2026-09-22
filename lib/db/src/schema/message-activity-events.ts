import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const messageActivityEventsTable = pgTable("message_activity_events", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  event_type: text("event_type").notNull(),
  entity_type: text("entity_type").notNull(),
  entity_id: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("message_activity_events_user_created_idx").on(table.user_id, table.created_at),
  index("message_activity_events_type_created_idx").on(table.event_type, table.created_at),
]);

export type MessageActivityEvent = typeof messageActivityEventsTable.$inferSelect;
