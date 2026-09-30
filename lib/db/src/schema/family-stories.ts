import {
  pgTable, serial, integer, text, timestamp, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { familiesTable, familyMembersTable } from "./families";
import { familyMemoriesTable } from "./family-memories";

// ─── Family Vault: Stories ────────────────────────────────────────────────────
// Narrative stories told by or about family members. Distinct from
// family_memories (which are the preserved items) — a story is the *told*
// narrative with structured metadata for the Story Engine.

export const familyStoryCategoryEnum = text("category"); // oral|written|tradition|recipe|song|proverb|biography

export const familyStoriesTable = pgTable("family_stories", {
  id:              serial("id").primaryKey(),
  family_id:       integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  author_id:       integer("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  teller_member_id: integer("teller_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  about_member_id:  integer("about_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  title:           text("title").notNull(),
  body:            text("body").notNull(),             // the narrative text
  audience:        text("audience").notNull().default("family"), // family|private
  category:        familyStoryCategoryEnum,            // oral|written|tradition|recipe|song|proverb|biography
  language:        text("language"),                   // e.g. "Twi", "English"
  memory_id:       integer("memory_id").references(() => familyMemoriesTable.id, { onDelete: "set null" }),
  date_year:       integer("date_year"),
  date_month:      integer("date_month"),
  date_day:        integer("date_day"),
  date_precision:  text("date_precision"), // day|month|year|decade|circa
  tags:            jsonb("tags").$type<string[]>().default([]),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_stories_family").on(t.family_id),
  index("idx_family_stories_about").on(t.about_member_id),
  index("idx_family_stories_author").on(t.author_id, t.created_at),
]);

/**
 * Durable idempotency ledger for copying a Moment caption into a Family Story.
 * The source moment is deliberately an integer without a foreign key: its
 * expiration/deletion lifecycle must never be changed or extended by a keep.
 * A deleted destination story leaves the ledger row behind, so retrying the
 * same action can never recreate content after a user deletes it.
 */
export const familyStoryKeepsTable = pgTable("family_story_keeps", {
  id:           serial("id").primaryKey(),
  family_id:    integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  moment_id:    integer("moment_id").notNull(),
  story_id:     integer("story_id").references(() => familyStoriesTable.id, { onDelete: "set null" }),
  created_by:   integer("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  created_at:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("family_story_keeps_family_moment_uidx").on(t.family_id, t.moment_id),
  index("family_story_keeps_created_by_idx").on(t.created_by, t.created_at),
]);

export type FamilyStory = typeof familyStoriesTable.$inferSelect;
export type InsertFamilyStory = typeof familyStoriesTable.$inferInsert;
export type FamilyStoryKeep = typeof familyStoryKeepsTable.$inferSelect;
