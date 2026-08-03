import {
  pgTable, serial, integer, text, timestamp, jsonb, pgEnum, index,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";

// ─── Phase 5 Enhancements: AI Director, Memory Mysteries, Character Evolution ─

export const legacyMysteryTypeEnum = pgEnum("legacy_mystery_type", [
  "unknown_person",
  "unknown_place",
  "unknown_date",
  "unknown_document",
  "unknown_event",
  "missing_interview",
]);

export const legacyMysteryStatusEnum = pgEnum("legacy_mystery_status", [
  "open",
  "investigating",
  "solved",
  "expired",
]);

export const legacyMissionTypeEnum = pgEnum("legacy_mission_type", [
  "record_interview",
  "identify_photo",
  "add_ancestor",
  "tag_location",
  "add_event",
  "upload_document",
  "reconnect_relative",
  "complete_chapter",
  "preserve_tradition",
]);

export const legacyMissionStatusEnum = pgEnum("legacy_mission_status", [
  "active",
  "completed",
  "expired",
  "skipped",
]);

// ── legacy_memory_mysteries ───────────────────────────────────────────────────
// Collaborative investigations for unidentified vault content. The AI Game
// Director identifies gaps (unidentified people in photos, unknown locations,
// missing event details) and turns them into Mystery Quests the family solves
// together. Solving a mystery adds real information to the vault.
export const legacyMemoryMysteriesTable = pgTable("legacy_memory_mysteries", {
  id:              serial("id").primaryKey(),
  family_id:       integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  mystery_type:    legacyMysteryTypeEnum("mystery_type").notNull(),
  status:          legacyMysteryStatusEnum("status").notNull().default("open"),
  title:           text("title").notNull(),
  description:     text("description"),
  vault_item_type: text("vault_item_type"),
  vault_item_id:   integer("vault_item_id"),
  resolution:       text("resolution"),
  resolved_by:      integer("resolved_by").references(() => familyMembersTable.id, { onDelete: "set null" }),
  ai_hint:          text("ai_hint"),
  suggested_actions: text("suggested_actions").array(),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolved_at:     timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("idx_legacy_mysteries_family").on(t.family_id),
  index("idx_legacy_mysteries_status").on(t.family_id, t.status),
]);

// ── legacy_ai_director_missions ───────────────────────────────────────────────
// Daily AI-generated missions derived from what's actually missing in the
// vault. The AI Director scans the knowledge graph and creates targeted
// missions that drive preservation — e.g. "Record an interview with Aunt Mary
// about her migration north" or "Identify the unknown person in the 1958 photo".
export const legacyAiDirectorMissionsTable = pgTable("legacy_ai_director_missions", {
  id:              serial("id").primaryKey(),
  family_id:       integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  mission_type:    legacyMissionTypeEnum("mission_type").notNull(),
  status:          legacyMissionStatusEnum("status").notNull().default("active"),
  title:           text("title").notNull(),
  description:     text("description").notNull(),
  gap_description: text("gap_description"),
  target_member_id:  integer("target_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  target_vault_item: text("target_vault_item"),
  reward_xp:         integer("reward_xp").notNull().default(50),
  reward_description: text("reward_description"),
  knowledge_version_id: integer("knowledge_version_id"),
  generated_at:    timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at:      timestamp("expires_at", { withTimezone: true }),
  completed_at:    timestamp("completed_at", { withTimezone: true }),
  completed_by:    integer("completed_by").references(() => familyMembersTable.id, { onDelete: "set null" }),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_missions_family").on(t.family_id),
  index("idx_legacy_missions_status").on(t.family_id, t.status),
  index("idx_legacy_missions_date").on(t.family_id, t.generated_at),
]);

// ── legacy_character_evolution ───────────────────────────────────────────────
// Tracks how each family member's game character evolves as new stories,
// memories, interviews, and photos are added. Each row links a character to
// a knowledge version, capturing their stats, new dialogue lines, journal
// entries, and unlocked content at that point in time. This makes "characters
// never remain static" real — the same person becomes richer as the family
// preserves more about them.
export const legacyCharacterEvolutionTable = pgTable("legacy_character_evolution", {
  id:                  serial("id").primaryKey(),
  family_id:           integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  member_id:           integer("member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  knowledge_version_id: integer("knowledge_version_id"),
  stats:               jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
  new_dialogue_count:  integer("new_dialogue_count").notNull().default(0),
  new_journal_count:   integer("new_journal_count").notNull().default(0),
  new_quest_count:     integer("new_quest_count").notNull().default(0),
  new_memory_count:    integer("new_memory_count").notNull().default(0),
  evolution_summary:   text("evolution_summary"),
  created_at:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_char_evo_member").on(t.member_id),
  index("idx_legacy_char_evo_family").on(t.family_id, t.member_id),
]);

export type LegacyMemoryMystery = typeof legacyMemoryMysteriesTable.$inferSelect;
export type InsertLegacyMemoryMystery = typeof legacyMemoryMysteriesTable.$inferInsert;
export type LegacyAiDirectorMission = typeof legacyAiDirectorMissionsTable.$inferSelect;
export type InsertLegacyAiDirectorMission = typeof legacyAiDirectorMissionsTable.$inferInsert;
export type LegacyCharacterEvolution = typeof legacyCharacterEvolutionTable.$inferSelect;
export type InsertLegacyCharacterEvolution = typeof legacyCharacterEvolutionTable.$inferInsert;
