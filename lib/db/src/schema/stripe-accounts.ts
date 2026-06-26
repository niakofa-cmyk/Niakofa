import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Stripe Connect Express accounts for helpers to receive payouts.
// One row per helper (unique on user_id).
export const stripeAccountsTable = pgTable("stripe_accounts", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().unique(),
  stripe_account_id: text("stripe_account_id").notNull().unique(),

  // Express | Standard
  account_type: text("account_type").notNull().default("express"),

  // Live status fields — synced from Stripe webhook account.updated events
  charges_enabled: boolean("charges_enabled").notNull().default(false),
  payouts_enabled: boolean("payouts_enabled").notNull().default(false),
  details_submitted: boolean("details_submitted").notNull().default(false),

  // Temporary onboarding URL (expires after ~10 minutes)
  onboarding_url: text("onboarding_url"),
  onboarding_url_expires: timestamp("onboarding_url_expires"),

  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type StripeAccount = typeof stripeAccountsTable.$inferSelect;
export type InsertStripeAccount = typeof stripeAccountsTable.$inferInsert;
