import {
  pgTable, serial, integer, text, timestamp, doublePrecision, pgEnum, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { familiesTable, familyMembersTable } from "./families";

// ─── Diaspora Platform: Family Vault — Memory objects ────────────────────────
// See docs/diaspora-platform-design.md §3.3.
// The unified "Memory" is the canonical preserved item (photo, letter, recipe,
// interview transcript, etc.). Every capture path converges on this table.
//
// NOTE: `nia_memories` already exists and is Nia's conversational memory of a
// user. This table is entirely separate — "FamilyMemory" is the TS type to
// avoid collisions in imports and grep results.

export const familyMemoryVisibilityEnum = pgEnum("family_memory_visibility", [
  "family",   // default — visible to all active family_members
  "branch",   // Phase C: restricted to a tagged family_tree branch
  "private",  // only the author + curators/owner
]);

export const familyMemorySourceEnum = pgEnum("family_memory_source", [
  "upload",
  "interview",
  "culture_card",
  "import",
]);

export const familyMemoriesTable = pgTable("family_memories", {
  id:                    serial("id").primaryKey(),
  family_id:             integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  // set null so a deleted account doesn't nuke the family archive (same
  // reasoning as griot_stories.author_id)
  author_id:             integer("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  title:                 text("title"),
  description:           text("description"),
  story:                 text("story"), // longer narrative text, e.g. edited interview transcript
  memory_date:           timestamp("memory_date", { withTimezone: true }), // when the *event* happened
  memory_date_precision: text("memory_date_precision").default("day"), // day|month|year|circa
  location_label:        text("location_label"),
  lat:                   doublePrecision("lat"),
  lng:                   doublePrecision("lng"),
  source:                familyMemorySourceEnum("source").notNull().default("upload"),
  visibility:            familyMemoryVisibilityEnum("visibility").notNull().default("family"),
  // Bare integer (no .references) to avoid circular import order with
  // family-interviews.ts. The FK is added in migration 0082 as
  // `interview_id_fk`. For Phase A reads use this column; writers in
  // post-0082 should prefer interview_id_fk.
  interview_id:          integer("interview_id"),
  created_at:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_memories_family").on(t.family_id),
  index("idx_family_memories_date").on(t.memory_date),
  index("idx_family_memories_author").on(t.author_id),
]);

export const familyMemoryTagsTable = pgTable("family_memory_tags", {
  id:        serial("id").primaryKey(),
  memory_id: integer("memory_id").notNull().references(() => familyMemoriesTable.id, { onDelete: "cascade" }),
  tag:       text("tag").notNull(), // free-text, lowercased at write time
}, (t) => [
  index("idx_family_memory_tags_memory").on(t.memory_id),
  index("idx_family_memory_tags_tag").on(t.tag),
]);

// Who appears in this memory. Prefers a real family_members link; falls back
// to free text for people not yet added as members (common for old photos).
export const familyMemoryPeopleTable = pgTable("family_memory_people", {
  id:        serial("id").primaryKey(),
  memory_id: integer("memory_id").notNull().references(() => familyMemoriesTable.id, { onDelete: "cascade" }),
  member_id: integer("member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  name_text: text("name_text"), // used when member_id is null
}, (t) => [
  index("idx_family_memory_people_memory").on(t.memory_id),
]);

export const familyMemoryCommentsTable = pgTable("family_memory_comments", {
  id:         serial("id").primaryKey(),
  memory_id:  integer("memory_id").notNull().references(() => familyMemoriesTable.id, { onDelete: "cascade" }),
  author_id:  integer("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  body:       text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_memory_comments_memory").on(t.memory_id),
]);

export type FamilyMemory = typeof familyMemoriesTable.$inferSelect;
export type InsertFamilyMemory = typeof familyMemoriesTable.$inferInsert;
export type FamilyMemoryTag = typeof familyMemoryTagsTable.$inferSelect;
export type FamilyMemoryPerson = typeof familyMemoryPeopleTable.$inferSelect;
export type FamilyMemoryComment = typeof familyMemoryCommentsTable.$inferSelect;
