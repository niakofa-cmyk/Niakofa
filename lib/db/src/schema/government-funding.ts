import { pgTable, serial, text, integer, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { governmentSponsorsTable } from "./government-sponsors";
import { usersTable } from "./users";
import { requestsTable } from "./requests";

/**
 * Public budget authorizations and request-level reservations.
 *
 * These records document a sponsor's approved appropriation and its allocation
 * to community work. They do not represent a payment, receipt, or payout.
 */
export const governmentBudgetsTable = pgTable("government_budgets", {
  id: serial("id").primaryKey(),
  government_sponsor_id: integer("government_sponsor_id")
    .notNull()
    .references(() => governmentSponsorsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  fiscal_year: text("fiscal_year").notNull(),
  appropriation_reference: text("appropriation_reference").notNull(),
  authorized_amount: numeric("authorized_amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"),
  created_by_user_id: integer("created_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  index("government_budgets_sponsor_status_idx").on(t.government_sponsor_id, t.status),
  uniqueIndex("government_budgets_appropriation_uidx")
    .on(t.government_sponsor_id, t.fiscal_year, t.appropriation_reference),
]);

export const governmentRequestFundingTable = pgTable("government_request_funding", {
  id: serial("id").primaryKey(),
  government_sponsor_id: integer("government_sponsor_id")
    .notNull()
    .references(() => governmentSponsorsTable.id, { onDelete: "restrict" }),
  budget_id: integer("budget_id")
    .notNull()
    .references(() => governmentBudgetsTable.id, { onDelete: "restrict" }),
  request_id: integer("request_id")
    .notNull()
    .references(() => requestsTable.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("approved"),
  notes: text("notes"),
  approved_by_user_id: integer("approved_by_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().default(sql`NOW()`),
}, (t) => [
  index("government_request_funding_sponsor_created_idx").on(t.government_sponsor_id, t.created_at),
  index("government_request_funding_budget_status_idx").on(t.budget_id, t.status),
  uniqueIndex("government_request_funding_sponsor_request_uidx").on(t.government_sponsor_id, t.request_id),
]);

export type GovernmentBudget = typeof governmentBudgetsTable.$inferSelect;
export type GovernmentRequestFunding = typeof governmentRequestFundingTable.$inferSelect;
