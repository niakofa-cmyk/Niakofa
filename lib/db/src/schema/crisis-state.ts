import { pgTable, serial, boolean, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Persisted county/region-wide emergency mode. Previously this was a plain
// in-memory module variable — it silently reset to inactive on every
// deploy/restart, and in any multi-instance deployment each instance had
// its own independent, divergent crisis state. Each activate/deactivate
// inserts a new row (cheap audit trail); GET /crisis/status reads the
// single most recent row.
export const crisisStateTable = pgTable("crisis_state", {
  id: serial("id").primaryKey(),
  active: boolean("active").notNull().default(false),
  message: text("message").notNull().default(""),
  level: text("level").notNull().default("warning"), // info | warning | critical
  resources: text("resources"), // JSON-encoded array of { label, phone?, url? }
  activated_by: text("activated_by"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // DB-enforced enum: only accepted values can be written, preventing silent
  // typos like "critcal" slipping in and breaking the frontend alert rendering.
  check("crisis_level_values", sql`${t.level} IN ('info', 'warning', 'critical')`),
]);

export type CrisisStateRow = typeof crisisStateTable.$inferSelect;
export type InsertCrisisStateRow = typeof crisisStateTable.$inferInsert;
