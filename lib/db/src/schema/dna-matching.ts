import {
  pgTable, serial, integer, text, timestamp, boolean, real,
  uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { familiesTable } from "./families";
import { usersTable } from "./users";

/**
 * A separate consent record keeps DNA matching opt-in distinct from importing
 * a provider export. Importing is never consent to compare with relatives.
 */
export const dnaMatchingConsentTable = pgTable("dna_matching_consents", {
  id: serial("id").primaryKey(),
  family_id: integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  opted_in: boolean("opted_in").notNull().default(false),
  consent_version: text("consent_version").notNull().default("dna-matching-v1"),
  consented_at: timestamp("consented_at", { withTimezone: true }),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("dna_matching_consents_family_user_unique").on(t.family_id, t.user_id),
  index("idx_dna_matching_consents_user").on(t.user_id),
]);

/**
 * Only derived comparison results are retained. No names, raw genotypes, or
 * provider files are copied into this table. Results are replaceable and
 * expire with the source profile's retention window.
 */
export const dnaMatchResultsTable = pgTable("dna_match_results", {
  id: serial("id").primaryKey(),
  family_id: integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  matched_family_id: integer("matched_family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  matched_user_id: integer("matched_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  similarity_score: real("similarity_score").notNull(),
  // Nullable by design: the current derived sketch is not a provider-grade
  // segment calculation and must not be rendered as a cM measurement.
  shared_cm_est: integer("shared_cm_est"),
  relationship_band: text("relationship_band").notNull(),
  confidence: text("confidence").notNull(),
  source: text("source").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex("dna_match_results_pair_unique").on(t.family_id, t.user_id, t.matched_family_id, t.matched_user_id),
  index("idx_dna_match_results_user_family").on(t.user_id, t.family_id),
  index("idx_dna_match_results_expiry").on(t.expires_at),
]);

export type DnaMatchingConsent = typeof dnaMatchingConsentTable.$inferSelect;
export type InsertDnaMatchingConsent = typeof dnaMatchingConsentTable.$inferInsert;
export type DnaMatchResult = typeof dnaMatchResultsTable.$inferSelect;
export type InsertDnaMatchResult = typeof dnaMatchResultsTable.$inferInsert;