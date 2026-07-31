import {
  pgTable, serial, integer, text, timestamp, jsonb, pgEnum, index, boolean,
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

export type LegacyWorld = typeof legacyWorldsTable.$inferSelect;
export type InsertLegacyWorld = typeof legacyWorldsTable.$inferInsert;
export type LegacyChapter = typeof legacyChaptersTable.$inferSelect;
export type InsertLegacyChapter = typeof legacyChaptersTable.$inferInsert;
export type LegacySession = typeof legacySessionsTable.$inferSelect;
export type InsertLegacySession = typeof legacySessionsTable.$inferInsert;
export type LegacyAchievement = typeof legacyAchievementsTable.$inferSelect;
export type InsertLegacyAchievement = typeof legacyAchievementsTable.$inferInsert;
