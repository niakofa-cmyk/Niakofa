import { pgTable, serial, integer, text, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { familiesTable, familyMembersTable } from "./families";
import { usersTable } from "./users";

export const diasporaResearchCasesTable = pgTable("diaspora_research_cases", {
  id: serial("id").primaryKey(),
  family_id: integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  created_by: integer("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  person_member_id: integer("person_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  research_question: text("research_question").notNull(),
  status: text("status").notNull().default("open"),
  confidence: text("confidence").notNull().default("unreviewed"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_diaspora_research_cases_family").on(t.family_id),
  index("idx_diaspora_research_cases_creator").on(t.created_by),
  index("idx_diaspora_research_cases_person").on(t.person_member_id),
  check("diaspora_research_cases_status_check", sql`${t.status} IN ('open', 'paused', 'resolved')`),
  check("diaspora_research_cases_confidence_check", sql`${t.confidence} IN ('unreviewed', 'possible', 'supported', 'strong')`),
]);

export const diasporaResearchEvidenceTable = pgTable("diaspora_research_evidence", {
  id: serial("id").primaryKey(),
  case_id: integer("case_id").notNull().references(() => diasporaResearchCasesTable.id, { onDelete: "cascade" }),
  created_by: integer("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  source_url: text("source_url"),
  citation: text("citation"),
  evidence_type: text("evidence_type").notNull().default("document"),
  confidence: text("confidence").notNull().default("possible"),
  notes: text("notes"),
  source_date: timestamp("source_date", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_diaspora_research_evidence_case").on(t.case_id),
  check("diaspora_research_evidence_type_check", sql`${t.evidence_type} IN ('document', 'shared_segment', 'pedigree', 'oral_history', 'place_history', 'dna_profile')`),
  check("diaspora_research_evidence_confidence_check", sql`${t.confidence} IN ('unreviewed', 'possible', 'supported', 'strong')`),
]);

export const diasporaResearchNotesTable = pgTable("diaspora_research_notes", {
  id: serial("id").primaryKey(),
  case_id: integer("case_id").notNull().references(() => diasporaResearchCasesTable.id, { onDelete: "cascade" }),
  created_by: integer("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_diaspora_research_notes_case").on(t.case_id),
]);

export type DiasporaResearchCase = typeof diasporaResearchCasesTable.$inferSelect;
export type DiasporaResearchEvidence = typeof diasporaResearchEvidenceTable.$inferSelect;
export type DiasporaResearchNote = typeof diasporaResearchNotesTable.$inferSelect;
