import {
  pgTable, serial, integer, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";
import { familyMemoriesTable } from "./family-memories";

// ─── Family Vault: Stories ────────────────────────────────────────────────────
// Narrative stories told by or about family members. Distinct from
// family_memories (which are the preserved items) — a story is the *told*
// narrative with structured metadata for the Story Engine.

export const familyStoryCategoryEnum = text("family_story_category"); // oral|written|tradition|recipe|song|proverb|biography

export const familyStoriesTable = pgTable("family_stories", {
  id:              serial("id").primaryKey(),
  family_id:       integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  teller_member_id: integer("teller_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  about_member_id:  integer("about_member_id").references(() => familyMembersTable.id, { onDelete: "set null" }),
  title:           text("title").notNull(),
  body:            text("body").notNull(),             // the narrative text
  category:        familyStoryCategoryEnum,            // oral|written|tradition|recipe|song|proverb|biography
  language:        text("language"),                   // e.g. "Twi", "English"
  memory_id:       integer("memory_id").references(() => familyMemoriesTable.id, { onDelete: "set null" }),
  tags:            jsonb("tags").$type<string[]>().default([]),
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_stories_family").on(t.family_id),
  index("idx_family_stories_about").on(t.about_member_id),
]);

export type FamilyStory = typeof familyStoriesTable.$inferSelect;
export type InsertFamilyStory = typeof familyStoriesTable.$inferInsert;
