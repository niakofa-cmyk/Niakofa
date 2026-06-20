import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const civicSuggestionsTable = pgTable("civic_suggestions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  description: text("description"),
  phone: text("phone"),
  website: text("website"),
  status: text("status").notNull().default("pending"),
  admin_notes: text("admin_notes"),
  reviewed_by: integer("reviewed_by").references(() => usersTable.id),
  reviewed_at: timestamp("reviewed_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});
