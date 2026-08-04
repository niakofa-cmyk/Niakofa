import {
  pgTable, serial, integer, text, timestamp, jsonb, pgEnum, index, date,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";
import { familyKnowledgeVersionsTable } from "./family-knowledge-versions";
import { legacySessionsTable, legacyChaptersTable } from "./legacy-engine";

// ─── Phase 5: Living Family Universe ──────────────────────────────────────────
// Cooperative family missions, shared seasonal events, dynamic AI Game Master,
// and world-evolution tracking. These tables make the family world feel alive
// and ever-changing — the final piece of the Legacy Mode roadmap.

// ── Enums ────────────────────────────────────────────────────────────────────

export const legacyEventTypeEnum = pgEnum("legacy_event_type", [
  "anniversary",
  "reunion",
  "cultural_holiday",
  "birthday",
  "migration_anniversary",
  "custom",
]);

export const legacyTriggerTypeEnum = pgEnum("legacy_trigger_type", [
  "fixed_date",
  "recurring_annual",
  "recurring_monthly",
  "knowledge_change",
]);

export const legacyEventStatusEnum = pgEnum("legacy_event_status", [
  "pending",
  "active",
  "completed",
  "expired",
]);

export const legacyNarrationTypeEnum = pgEnum("legacy_narration_type", [
  "scene_intro",
  "dialogue",
  "quest_prompt",
  "chapter_summary",
  "historical_context",
  "ancestor_introduction",
]);

export const legacyChangeTypeEnum = pgEnum("legacy_change_type", [
  "member_added",
  "memory_added",
  "story_added",
  "interview_added",
  "place_added",
  "event_added",
  "relation_added",
  "world_regenerated",
]);

// ── legacy_seasonal_events ────────────────────────────────────────────────────
// Family events tied to anniversaries, reunions, cultural holidays, birthdays,
// and migration anniversaries. Each event has a trigger type, a contribution
// goal, and a reward that unlocks when the goal is met.

export const legacySeasonalEventsTable = pgTable("legacy_seasonal_events", {
  id:                 serial("id").primaryKey(),
  family_id:          integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  event_type:         legacyEventTypeEnum("event_type").notNull().default("custom"),
  title:              text("title").notNull(),
  description:        text("description"),
  trigger_type:       legacyTriggerTypeEnum("trigger_type").notNull().default("recurring_annual"),
  trigger_date:       date("trigger_date"),
  target_member_id:   integer("target_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  goal:               integer("goal").notNull().default(5),
  reward_title:       text("reward_title"),
  reward_description: text("reward_description"),
  status:             legacyEventStatusEnum("status").notNull().default("pending"),
  metadata:           jsonb("metadata").$type<Record<string, unknown>>().default({}),
  created_at:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completed_at:       timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  index("idx_legacy_seasonal_events_family").on(t.family_id),
  index("idx_legacy_seasonal_events_status").on(t.family_id, t.status),
  index("idx_legacy_seasonal_events_trigger").on(t.family_id, t.trigger_type),
]);

// ── legacy_seasonal_event_participations ─────────────────────────────────────
// Tracks which family members contributed to a seasonal event and what they
// contributed. The DB trigger auto-completes the event when the count reaches
// the goal.

export const legacySeasonalEventParticipationsTable = pgTable("legacy_seasonal_event_participations", {
  id:                serial("id").primaryKey(),
  event_id:          integer("event_id").notNull().references(() => legacySeasonalEventsTable.id, { onDelete: "cascade" }),
  member_id:         integer("member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  user_id:           integer("user_id"),
  contribution_type: text("contribution_type").notNull(),
  contribution_note: text("contribution_note"),
  created_at:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_seasonal_event_participations_event").on(t.event_id),
  index("idx_legacy_seasonal_event_participations_member").on(t.member_id),
]);

// ── legacy_game_master_narrations ─────────────────────────────────────────────
// AI-generated narration content: scene intros, dialogue, quest prompts,
// chapter summaries, historical context, ancestor introductions. Stores
// model provenance and prompt hash for cache deduplication.

export const legacyGameMasterNarrationsTable = pgTable("legacy_game_master_narrations", {
  id:               serial("id").primaryKey(),
  family_id:        integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  session_id:       integer("session_id").references(() => legacySessionsTable.id, { onDelete: "cascade" }),
  chapter_id:       integer("chapter_id").references(() => legacyChaptersTable.id, { onDelete: "cascade" }),
  narration_type:   legacyNarrationTypeEnum("narration_type").notNull(),
  content:          text("content").notNull(),
  content_metadata: jsonb("content_metadata").$type<Record<string, unknown>>().default({}),
  model_used:       text("model_used"),
  prompt_hash:      text("prompt_hash"),
  created_at:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_game_master_narrations_family").on(t.family_id),
  index("idx_legacy_game_master_narrations_session").on(t.session_id),
  index("idx_legacy_game_master_narrations_chapter").on(t.chapter_id),
  index("idx_legacy_game_master_narrations_hash").on(t.family_id, t.prompt_hash),
]);

// ── legacy_world_evolution_log ────────────────────────────────────────────────
// Append-only log recording every time the family world changes. Links to
// family_knowledge_versions so families can see how their game world has
// grown over time — the "world regenerates" loop made visible.

export const legacyWorldEvolutionLogTable = pgTable("legacy_world_evolution_log", {
  id:                  serial("id").primaryKey(),
  family_id:           integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  knowledge_version_id: integer("knowledge_version_id").references(() => familyKnowledgeVersionsTable.id, { onDelete: "set null" }),
  change_type:         legacyChangeTypeEnum("change_type").notNull(),
  change_description:  text("change_description"),
  affected_count:      integer("affected_count").notNull().default(1),
  previous_version:    integer("previous_version"),
  new_version:         integer("new_version"),
  created_at:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_world_evolution_log_family").on(t.family_id),
  index("idx_legacy_world_evolution_log_type").on(t.family_id, t.change_type),
  index("idx_legacy_world_evolution_log_created").on(t.family_id, t.created_at),
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export type LegacySeasonalEvent = typeof legacySeasonalEventsTable.$inferSelect;
export type InsertLegacySeasonalEvent = typeof legacySeasonalEventsTable.$inferInsert;
export type LegacySeasonalEventParticipation = typeof legacySeasonalEventParticipationsTable.$inferSelect;
export type InsertLegacySeasonalEventParticipation = typeof legacySeasonalEventParticipationsTable.$inferInsert;
export type LegacyGameMasterNarration = typeof legacyGameMasterNarrationsTable.$inferSelect;
export type InsertLegacyGameMasterNarration = typeof legacyGameMasterNarrationsTable.$inferInsert;
export type LegacyWorldEvolutionLog = typeof legacyWorldEvolutionLogTable.$inferSelect;
export type InsertLegacyWorldEvolutionLog = typeof legacyWorldEvolutionLogTable.$inferInsert;
