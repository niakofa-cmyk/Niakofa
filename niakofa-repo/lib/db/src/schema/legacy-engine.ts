import {
  pgTable, serial, integer, text, timestamp, jsonb, pgEnum, index, boolean, uniqueIndex,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";
import { familyKnowledgeVersionsTable } from "./family-knowledge-versions";

// ─── Legacy Engine: World, Chapters, Sessions ──────────────────────────────────
// The core gameplay domain tables. These are NOT derived from counts — they
// are first-class game objects that reference the Family Vault for content.

export const legacyWorldStatusEnum = pgEnum("legacy_world_status", [
  "generating",
  "ready",
  "stale",
]);

export const legacyWorldsTable = pgTable("legacy_worlds", {
  id:                   serial("id").primaryKey(),
  family_id:            integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  knowledge_version_id: integer("knowledge_version_id").references(() => familyKnowledgeVersionsTable.id, { onDelete: "set null" }),
  status:               legacyWorldStatusEnum("status").notNull().default("generating"),
  world_data:           jsonb("world_data").$type<Record<string, unknown>>().default({}),
  created_at:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:           timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_worlds_family").on(t.family_id),
]);

export const legacyChapterStatusEnum = pgEnum("legacy_chapter_status", [
  "locked",       // not yet available
  "unlocked",     // ready to play
  "in_progress",  // player has started
  "completed",    // player finished
  "skipped",      // player chose to skip
]);

export const legacyChaptersTable = pgTable("legacy_chapters", {
  id:              serial("id").primaryKey(),
  world_id:        integer("world_id").notNull().references(() => legacyWorldsTable.id, { onDelete: "cascade" }),
  family_id:       integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  ancestor_member_id: integer("ancestor_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  chapter_number:  integer("chapter_number").notNull(),
  title:           text("title").notNull(),
  synopsis:        text("synopsis"),
  status:          legacyChapterStatusEnum("status").notNull().default("locked"),
  chapter_data:    jsonb("chapter_data").$type<Record<string, unknown>>().default({}),
  unlocked_at:     timestamp("unlocked_at", { withTimezone: true }),
  completed_at:    timestamp("completed_at", { withTimezone: true }),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_chapters_world").on(t.world_id),
  index("idx_legacy_chapters_family").on(t.family_id),
  index("idx_legacy_chapters_status").on(t.status),
]);

export const legacySessionStatusEnum = pgEnum("legacy_session_status", [
  "active",
  "paused",
  "completed",
  "abandoned",
]);

export const legacySessionsTable = pgTable("legacy_sessions", {
  id:            serial("id").primaryKey(),
  family_id:     integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  world_id:      integer("world_id").notNull().references(() => legacyWorldsTable.id, { onDelete: "cascade" }),
  user_id:       integer("user_id"),  // references users(id) — bare int to avoid circular import
  ancestor_member_id: integer("ancestor_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  current_chapter_id: integer("current_chapter_id").references(() => legacyChaptersTable.id, { onDelete: "set null" }),
  status:        legacySessionStatusEnum("status").notNull().default("active"),
  session_state: jsonb("session_state").$type<Record<string, unknown>>().default({}),
  started_at:    timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  ended_at:      timestamp("ended_at", { withTimezone: true }),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_sessions_family").on(t.family_id),
  index("idx_legacy_sessions_user").on(t.user_id),
  index("idx_legacy_sessions_status").on(t.status),
]);

export const legacyAchievementCategoryEnum = pgEnum("legacy_achievement_category", [
  "vault_prompt",         // unlocked by adding vault data
  "reconnection",         // unlocked by reconnecting relatives
  "gameplay",             // unlocked by playing chapters
  "preservation",         // unlocked by preserving stories/interviews
]);

export const legacyAchievementsTable = pgTable("legacy_achievements", {
  id:            serial("id").primaryKey(),
  family_id:     integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  achievement_key: text("achievement_key").notNull(),  // "ancestor_walker", "voice_of_elders", etc.
  category:      legacyAchievementCategoryEnum("category").notNull(),
  title:         text("title").notNull(),
  description:   text("description").notNull(),
  progress:      integer("progress").notNull().default(0),
  goal:          integer("goal").notNull(),
  unlocked:      boolean("unlocked").notNull().default(false),
  unlocked_at:   timestamp("unlocked_at", { withTimezone: true }),
  metadata:      jsonb("metadata").$type<Record<string, unknown>>().default({}),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_achievements_family").on(t.family_id),
  index("idx_legacy_achievements_key").on(t.family_id, t.achievement_key),
  index("idx_legacy_achievements_unlocked").on(t.family_id, t.unlocked),
]);

// ─── Quest Progress ─────────────────────────────────────────────────────────
// AI-generated quests (legacy.ts) are cached by family+fingerprint and never
// persisted as rows of their own — a quest's id is only stable for the
// lifetime of that cache entry. This table durably records THAT a given
// quest id (scoped to the fingerprint it was generated under) was completed
// by a given user, so:
//   1. the same quest can't be "completed" over and over for repeat XP/credit
//   2. a family can see its own history of completed quests, independent of
//      the quest cache expiring or the fingerprint changing
export const legacyQuestProgressTable = pgTable("legacy_quest_progress", {
  id:          serial("id").primaryKey(),
  family_id:   integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  user_id:     integer("user_id").notNull(),
  quest_id:    text("quest_id").notNull(),       // AiQuest.id from legacy.ts (stable per fingerprint)
  fingerprint: text("fingerprint").notNull(),    // reservoir fingerprint the quest was generated under
  quest_title: text("quest_title").notNull(),    // snapshot — quest cache can expire independently
  quest_category: text("quest_category").notNull(),
  xp_awarded:  integer("xp_awarded").notNull().default(0),
  completed_at: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_quest_progress_family").on(t.family_id),
  index("idx_legacy_quest_progress_user").on(t.family_id, t.user_id),
  // One completion per (family, user, quest_id, fingerprint) — enforced at
  // the DB level so re-completing the identical quest can only ever be a
  // no-op, never a duplicate XP/credit, even under concurrent requests.
  uniqueIndex("idx_legacy_quest_progress_uidx").on(t.family_id, t.user_id, t.quest_id, t.fingerprint),
]);

export type LegacyWorld = typeof legacyWorldsTable.$inferSelect;
export type InsertLegacyWorld = typeof legacyWorldsTable.$inferInsert;
export type LegacyChapter = typeof legacyChaptersTable.$inferSelect;
export type InsertLegacyChapter = typeof legacyChaptersTable.$inferInsert;
export type LegacySession = typeof legacySessionsTable.$inferSelect;
export type InsertLegacySession = typeof legacySessionsTable.$inferInsert;
export type LegacyAchievement = typeof legacyAchievementsTable.$inferSelect;
export type InsertLegacyAchievement = typeof legacyAchievementsTable.$inferInsert;
export type LegacyQuestProgress = typeof legacyQuestProgressTable.$inferSelect;
export type InsertLegacyQuestProgress = typeof legacyQuestProgressTable.$inferInsert;
