import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

// One-time codes proving email ownership for the legacy set-initial-password
// flow. Replaces the previous "proof" of just matching user_id + email
// (both non-secret, guessable values) with an actual emailed secret.
export const passwordResetCodesTable = pgTable("password_reset_codes", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  code_hash: text("code_hash").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  used_at: timestamp("used_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("password_reset_codes_user_id_idx").on(t.user_id),
]);

export type PasswordResetCode = typeof passwordResetCodesTable.$inferSelect;
export type InsertPasswordResetCode = typeof passwordResetCodesTable.$inferInsert;
