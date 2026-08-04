import {
  pgTable, serial, integer, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { familiesTable } from "./families";

// ─── Legacy Engine: Family Knowledge Versions ─────────────────────────────────
// Each row is a snapshot of the family's vault at a point in time. The
// fingerprint hash changes when ANY underlying data changes (not just counts)
// so the Legacy Engine knows when to regenerate the game world.
//
// family_knowledge_versions is the core of the "world regenerates" loop:
//   1. Family adds a memory / story / interview / place / event
//   2. A new knowledge version is created with an updated fingerprint
//   3. Legacy Engine detects version change → regenerates quests, chapters, stages
//   4. Player sees new content derived from the updated vault

export const familyKnowledgeVersionsTable = pgTable("family_knowledge_versions", {
  id:            serial("id").primaryKey(),
  family_id:     integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  version:       integer("version").notNull(),        // monotonically increasing per family
  fingerprint:   text("fingerprint").notNull(),        // sha256 of canonical dataset
  snapshot:      jsonb("snapshot").$type<{
    member_ids: string[];
    memory_ids: string[];
    interview_ids: string[];
    story_ids: string[];
    place_ids: string[];
    event_ids: string[];
    asset_ids: string[];
  }>().notNull(),
  created_at:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_family_knowledge_versions_family").on(t.family_id, t.version),
  index("idx_family_knowledge_versions_fp").on(t.family_id, t.fingerprint),
]);

export type FamilyKnowledgeVersion = typeof familyKnowledgeVersionsTable.$inferSelect;
export type InsertFamilyKnowledgeVersion = typeof familyKnowledgeVersionsTable.$inferInsert;
