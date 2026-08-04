import { pgTable, serial, text, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
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
  reviewed_by: integer("reviewed_by").references(() => usersTable.id, { onDelete: "set null" }),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Mirror crisis_state's pattern: constrain status to known values so a typo
  // can never silently enter the admin review queue. Values match the review
  // route's validStatuses in artifacts/api-server/src/routes/civic.ts.
  check("civic_suggestions_status_values", sql`${t.status} IN ('pending', 'approved', 'dismissed')`),
]);
