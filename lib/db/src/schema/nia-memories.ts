import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const niaMemoriesTable = pgTable("nia_memories", {
  user_id: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  memory: text("memory").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NiaMemory = typeof niaMemoriesTable.$inferSelect;
