import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * nia_toggle_audit — append-only paper trail of every Nia AI kill-switch change.
 *
 * Legal/compliance note (see replit.md → "Legal/tax flags"): admins need a
 * verifiable record of who enabled/disabled Nia, when, and why — both for
 * internal accountability and in case a regulator or user asks "was AI
 * active during X". Never updated or deleted, only inserted.
 */
export const niaToggleAuditTable = pgTable("nia_toggle_audit", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull(),
  admin_user_id: integer("admin_user_id").notNull(),
  admin_email: text("admin_email").notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type NiaToggleAudit = typeof niaToggleAuditTable.$inferSelect;
