import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { familiesTable } from "./families";
import { usersTable } from "./users";

export const dnaProviderEnum = pgEnum("dna_provider", [
  "AncestryDNA",
  "23andMe",
  "MyHeritage",
  "LivingDNA",
  "FamilyTreeDNA",
]);

export const dnaImportStatusEnum = pgEnum("dna_import_status", [
  "failed",
  "ready",
]);

/**
 * Stores only the validated, derived summary of a user's DNA export.
 * Raw genotype bytes are intentionally never persisted.
 */
export const familyDnaProfilesTable = pgTable("family_dna_profiles", {
  id: serial("id").primaryKey(),
  family_id: integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: dnaProviderEnum("provider").notNull(),
  status: dnaImportStatusEnum("status").notNull(),
  source_file_name: text("source_file_name").notNull(),
  source_format: text("source_format").notNull(),
  dataset_fingerprint: text("dataset_fingerprint").notNull(),
  marker_count: integer("marker_count").notNull().default(0),
  // One-way MinHash-style sketch of canonical marker records. This is a
  // derived comparison aid, never a copy of the provider genotype export.
  marker_sketch: jsonb("marker_sketch").$type<number[]>(),
  raw_data_retained: boolean("raw_data_retained").notNull().default(false),
  ethnicity_available: boolean("ethnicity_available").notNull().default(false),
  match_count: integer("match_count"),
  error_code: text("error_code"),
  retention_expires_at: timestamp("retention_expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("family_dna_profiles_family_user_unique").on(t.family_id, t.user_id),
  index("idx_family_dna_profiles_user").on(t.user_id),
  index("idx_family_dna_profiles_retention").on(t.retention_expires_at),
]);

export type FamilyDnaProfile = typeof familyDnaProfilesTable.$inferSelect;
export type InsertFamilyDnaProfile = typeof familyDnaProfilesTable.$inferInsert;