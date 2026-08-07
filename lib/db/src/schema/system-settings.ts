import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * system_settings — key/value store for global app configuration.
 *
 * Currently used by the Nia killswitch: key "nia_enabled" stores "true" or
 * "false" so the toggle survives Railway redeploys (unlike an in-memory var).
 *
 * Both api-server (admin-analytics.ts) and nia-service (lib/db.ts) read this
 * table — they share the same Postgres instance so a write in one is visible
 * to the other within nia-service's 10s cache window.
 */
export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export type SystemSetting = typeof systemSettingsTable.$inferSelect;
