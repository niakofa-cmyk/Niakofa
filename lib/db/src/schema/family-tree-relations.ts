import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { familiesTable, familyMembersTable } from "./families";

// ─── Diaspora Platform: Family Tree Relations ────────────────────────────────
// Phase C of the Diaspora Platform build (see docs/diaspora-platform-design.md).
// Stores relationship edges between family members to power the interactive
// genealogy tree. Two relation types:
//   - 'parent': from_member is the parent of to_member (directional)
//   - 'spouse': from_member and to_member are spouses (bidirectional in display)
//
// The family_members table already holds people (from direct invites or GEDCOM
// import). This table adds the *edges* between them so the tree can be rendered
// as a connected graph rather than a flat list of nodes.

export const familyTreeRelationsTable = pgTable("family_tree_relations", {
  id:              serial("id").primaryKey(),
  family_id:       integer("family_id").notNull().references(() => familiesTable.id, { onDelete: "cascade" }),
  from_member_id:  integer("from_member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  to_member_id:    integer("to_member_id").notNull().references(() => familyMembersTable.id, { onDelete: "cascade" }),
  relation_type:   text("relation_type").notNull(), // 'parent' | 'spouse'
  created_at:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("family_tree_relations_unique_edge").on(t.family_id, t.from_member_id, t.to_member_id, t.relation_type),
  index("idx_family_tree_relations_family").on(t.family_id),
  index("idx_family_tree_relations_from").on(t.from_member_id),
  index("idx_family_tree_relations_to").on(t.to_member_id),
]);

export type FamilyTreeRelation = typeof familyTreeRelationsTable.$inferSelect;
export type InsertFamilyTreeRelation = typeof familyTreeRelationsTable.$inferInsert;
