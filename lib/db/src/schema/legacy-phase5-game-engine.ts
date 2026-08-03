import {
  pgTable, serial, integer, text, timestamp, jsonb, boolean, pgEnum, index,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";
import { familyKnowledgeVersionsTable } from "./family-knowledge-versions";
import { familyPlacesTable } from "./family-places";
import { familyEventsTable } from "./family-events";
import { familyMemoriesTable } from "./family-memories";
import { legacyWorldsTable, legacyChaptersTable } from "./legacy-engine";
import { usersTable } from "./users";

// ─── Phase 5: Missing Game Engine Tables (recreated from 0092 design) ────────

export const legacySceneTypeEnum = pgEnum("legacy_scene_type", [
  "narration", "dialogue", "reflection", "quest", "transition",
]);

export const historicalLayerEnum = pgEnum("historical_layer", [
  "verified", "historical_context", "narrative_interpretation",
]);

export const legacyCollectibleTypeEnum = pgEnum("legacy_collectible_type", [
  "photo", "letter", "document", "recipe", "artifact", "audio", "video", "certificate",
]);

export const legacySkillTypeEnum = pgEnum("legacy_skill_type", [
  "historian", "explorer", "story_keeper", "photographer",
  "interviewer", "archivist", "genealogist", "community_builder",
]);

// ── legacy_scenes ─────────────────────────────────────────────────────────────
export const legacyScenesTable = pgTable("legacy_scenes", {
  id:                    serial("id").primaryKey(),
  chapter_id:           integer("chapter_id").notNull().references(() => legacyChaptersTable.id, { onDelete: "cascade" }),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  scene_number:          integer("scene_number").notNull(),
  scene_type:            legacySceneTypeEnum("scene_type").notNull().default("narration"),
  title:                 text("title").notNull(),
  narration:             text("narration"),
  background_description: text("background_description"),
  historical_layer:      historicalLayerEnum("historical_layer").notNull().default("verified"),
  place_id:              integer("place_id").references(() => familyPlacesTable.id, { onDelete: "set null" }),
  event_id:              integer("event_id").references(() => familyEventsTable.id, { onDelete: "set null" }),
  memory_id:             integer("memory_id").references(() => familyMemoriesTable.id, { onDelete: "set null" }),
  topics:                text("topics").array().default([]),
  is_ai_generated:       boolean("is_ai_generated").notNull().default(false),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_scenes_chapter").on(t.chapter_id),
  index("idx_legacy_scenes_family").on(t.family_id),
]);

// ── legacy_dialogues ──────────────────────────────────────────────────────────
export const legacyDialoguesTable = pgTable("legacy_dialogues", {
  id:                    serial("id").primaryKey(),
  scene_id:              integer("scene_id").notNull().references(() => legacyScenesTable.id, { onDelete: "cascade" }),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  speaker_name:          text("speaker_name").notNull(),
  speaker_role:          text("speaker_role"),
  dialogue_text:         text("dialogue_text").notNull(),
  emotion:               text("emotion"),
  dialogue_order:        integer("dialogue_order").notNull().default(0),
  is_ai_generated:       boolean("is_ai_generated").notNull().default(false),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_dialogues_scene").on(t.scene_id),
  index("idx_legacy_dialogues_family").on(t.family_id),
]);

// ── legacy_choices ─────────────────────────────────────────────────────────────
export const legacyChoicesTable = pgTable("legacy_choices", {
  id:                    serial("id").primaryKey(),
  scene_id:              integer("scene_id").notNull().references(() => legacyScenesTable.id, { onDelete: "cascade" }),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  choice_text:           text("choice_text").notNull(),
  consequence_text:      text("consequence_text"),
  leads_to_scene_id:     integer("leads_to_scene_id").references(() => legacyScenesTable.id, { onDelete: "set null" }),
  stat_changes:          jsonb("stat_changes").$type<Record<string, number>>().notNull().default({}),
  xp_reward:             integer("xp_reward").notNull().default(0),
  creates_mystery_quest: boolean("creates_mystery_quest").notNull().default(false),
  requires_memory_text:  boolean("requires_memory_text").notNull().default(false),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_choices_scene").on(t.scene_id),
  index("idx_legacy_choices_family").on(t.family_id),
]);

// ── legacy_world_versions ──────────────────────────────────────────────────────
export const legacyWorldVersionsTable = pgTable("legacy_world_versions", {
  id:                    serial("id").primaryKey(),
  world_id:              integer("world_id").notNull().references(() => legacyWorldsTable.id, { onDelete: "cascade" }),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  knowledge_version_id:  integer("knowledge_version_id").references(() => familyKnowledgeVersionsTable.id, { onDelete: "set null" }),
  version_label:         text("version_label"),
  changes:               jsonb("changes").$type<Record<string, unknown>>().notNull().default({}),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_world_versions_world").on(t.world_id),
  index("idx_legacy_world_versions_family").on(t.family_id),
]);

// ── legacy_collectibles ────────────────────────────────────────────────────────
export const legacyCollectiblesTable = pgTable("legacy_collectibles", {
  id:                    serial("id").primaryKey(),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  member_id:             integer("member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  collectible_type:      legacyCollectibleTypeEnum("collectible_type").notNull(),
  title:                 text("title").notNull(),
  description:           text("description"),
  source_vault_item_id:  integer("source_vault_item_id"),
  source_vault_item_type: text("source_vault_item_type"),
  unlock_condition:      text("unlock_condition"),
  unlocked:              boolean("unlocked").notNull().default(false),
  unlocked_at:           timestamp("unlocked_at", { withTimezone: true }),
  unlocked_by_user_id:   integer("unlocked_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  metadata:              jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_collectibles_family").on(t.family_id),
  index("idx_legacy_collectibles_member").on(t.member_id),
]);

// ── legacy_skills ──────────────────────────────────────────────────────────────
export const legacySkillsTable = pgTable("legacy_skills", {
  id:                    serial("id").primaryKey(),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  member_id:             integer("member_id").references(() => familyMembersTable.id, { onDelete: "cascade" }),
  skill_type:            legacySkillTypeEnum("skill_type").notNull(),
  level:                 integer("level").notNull().default(0),
  xp:                    integer("xp").notNull().default(0),
  unlocked_abilities:    text("unlocked_abilities").array().default([]),
  metadata:              jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_skills_family").on(t.family_id),
  index("idx_legacy_skills_member").on(t.member_id),
]);

export type LegacyScene = typeof legacyScenesTable.$inferSelect;
export type InsertLegacyScene = typeof legacyScenesTable.$inferInsert;
export type LegacyDialogue = typeof legacyDialoguesTable.$inferSelect;
export type InsertLegacyDialogue = typeof legacyDialoguesTable.$inferInsert;
export type LegacyChoice = typeof legacyChoicesTable.$inferSelect;
export type InsertLegacyChoice = typeof legacyChoicesTable.$inferInsert;
export type LegacyWorldVersion = typeof legacyWorldVersionsTable.$inferSelect;
export type InsertLegacyWorldVersion = typeof legacyWorldVersionsTable.$inferInsert;
export type LegacyCollectible = typeof legacyCollectiblesTable.$inferSelect;
export type InsertLegacyCollectible = typeof legacyCollectiblesTable.$inferInsert;
export type LegacySkill = typeof legacySkillsTable.$inferSelect;
export type InsertLegacySkill = typeof legacySkillsTable.$inferInsert;
