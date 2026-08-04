import {
  pgTable, serial, integer, text, timestamp, pgEnum, index,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";

// ─── Legacy Engine: Family Challenges (Phase 4 — cooperative missions) ───────
// See migration 0099_legacy_family_challenges_real.sql for the corresponding
// DDL and the note on why this supersedes 0097 (documentation-only migration
// that never created these tables against the real Postgres DB).

export const legacyChallengeTypeEnum = pgEnum("legacy_challenge_type", [
  "story_collection",
  "preservation",
  "exploration",
  "reunion",
]);

export const legacyChallengeStatusEnum = pgEnum("legacy_challenge_status", [
  "active",
  "completed",
  "expired",
]);

export const legacyContributionTypeEnum = pgEnum("legacy_contribution_type", [
  "interview",
  "photo",
  "story",
  "location",
  "document",
  "checkin",
]);

export const legacyFamilyChallengesTable = pgTable("legacy_family_challenges", {
  id:                   serial("id").primaryKey(),
  family_id:            integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  challenge_type:       legacyChallengeTypeEnum("challenge_type").notNull(),
  title:                text("title").notNull(),
  description:          text("description").notNull(),
  goal:                 integer("goal").notNull().default(5),
  reward_title:         text("reward_title"),
  reward_description:   text("reward_description"),
  status:               legacyChallengeStatusEnum("status").notNull().default("active"),
  deadline:             timestamp("deadline", { withTimezone: true }),
  created_by_member_id: integer("created_by_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  completed_at:         timestamp("completed_at", { withTimezone: true }),
  created_at:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_family_challenges_family").on(t.family_id),
  index("idx_legacy_family_challenges_status").on(t.status),
]);

export const legacyChallengeContributionsTable = pgTable("legacy_challenge_contributions", {
  id:                serial("id").primaryKey(),
  challenge_id:      integer("challenge_id").notNull().references(() => legacyFamilyChallengesTable.id, { onDelete: "cascade" }),
  member_id:         integer("member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  contribution_type: legacyContributionTypeEnum("contribution_type").notNull(),
  vault_item_ref:    text("vault_item_ref"),
  contribution_note: text("contribution_note"),
  created_at:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_legacy_challenge_contributions_challenge").on(t.challenge_id),
]);

export type LegacyFamilyChallenge = typeof legacyFamilyChallengesTable.$inferSelect;
export type InsertLegacyFamilyChallenge = typeof legacyFamilyChallengesTable.$inferInsert;
export type LegacyChallengeContribution = typeof legacyChallengeContributionsTable.$inferSelect;
export type InsertLegacyChallengeContribution = typeof legacyChallengeContributionsTable.$inferInsert;
