import {
  pgTable, serial, integer, text, timestamp, pgEnum, jsonb, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { familiesTable, familyMembersTable } from "./families";
import { familyMemoryAssetsTable } from "./family-memory-assets";

// ─── Diaspora Platform: Oral History — Family Interviews ──────────────────────
// A guided Oral History session. Once transcribed + reviewed it produces one
// family_memory (the resulting_memory_id back-ref). Reuses the existing
// Nia transcription infrastructure via a dedicated family_transcription_jobs
// table (NOT sharing griot_transcription_jobs — see design doc §9.1).

export const familyInterviewStatusEnum = pgEnum("family_interview_status", [
  "scheduled",
  "recording",
  "transcribing",
  "review",
  "published",
]);

export const familyInterviewsTable = pgTable("family_interviews", {
  id:                  serial("id").primaryKey(),
  family_id:           integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  // who is being interviewed
  subject_member_id:   integer("subject_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  interviewer_id:      integer("interviewer_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Nia-suggested or curated prompts sent to the client before recording
  prompts_used:        jsonb("prompts_used").$type<string[]>().default([]),
  status:              familyInterviewStatusEnum("status").notNull().default("scheduled"),
  // bare integer to avoid circular import with family-memories.ts
  // The FK is added in migration 0082 as a validated ALTER TABLE constraint.
  resulting_memory_id: integer("resulting_memory_id"),
  created_at:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_interviews_family").on(t.family_id),
  index("idx_family_interviews_status").on(t.status),
]);

export const familyTranscriptionJobStatusEnum = pgEnum("family_transcription_status", [
  "pending",
  "processing",
  "done",
  "failed",
]);

// Independent transcription job queue for family interview audio.
// Deliberately does NOT share griot_transcription_jobs (see design doc §9.1).
export const familyTranscriptionJobsTable = pgTable("family_transcription_jobs", {
  id:            serial("id").primaryKey(),
  asset_id:      integer("asset_id").notNull().references(() => familyMemoryAssetsTable.id, { onDelete: "cascade" }),
  interview_id:  integer("interview_id").references(() => familyInterviewsTable.id, { onDelete: "set null" }),
  status:        familyTranscriptionJobStatusEnum("status").notNull().default("pending"),
  error_message: text("error_message"),
  attempts:      integer("attempts").notNull().default(0),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_transcription_jobs_status").on(t.status),
  index("idx_family_transcription_jobs_asset").on(t.asset_id),
]);

export type FamilyInterview = typeof familyInterviewsTable.$inferSelect;
export type InsertFamilyInterview = typeof familyInterviewsTable.$inferInsert;
export type FamilyTranscriptionJob = typeof familyTranscriptionJobsTable.$inferSelect;
