import { pgTable, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export interface StructuredMemory {
  recurring_needs: string[];
  accessibility_notes: string[];
  people_mentioned: { name: string; relation: string }[];
  corrections: string[];
  preferred_language?: string;
  emotional_arc?: "improving" | "stable" | "declining" | "unknown";
  resources_that_worked?: string[];
}

const DEFAULT_STRUCTURED: StructuredMemory = {
  recurring_needs: [],
  accessibility_notes: [],
  people_mentioned: [],
  corrections: [],
};

export const niaMemoriesTable = pgTable("nia_memories", {
  user_id: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  memory: text("memory").notNull(),
  structured: jsonb("structured").notNull().$type<StructuredMemory>().default(DEFAULT_STRUCTURED),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NiaMemory = typeof niaMemoriesTable.$inferSelect;
