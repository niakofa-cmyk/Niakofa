-- 0091_family_tree_relations.sql
-- Family Tree relationships — parent/child and spouse edges between family members.
-- Enables the interactive genealogy tree (Phase C of the Diaspora Platform).
-- Idempotent: uses IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS family_tree_relations (
  id          serial PRIMARY KEY,
  family_id   integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  -- The "from" person in the relationship (e.g. the parent in a parent-child link)
  from_member_id integer NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  -- The "to" person in the relationship (e.g. the child in a parent-child link)
  to_member_id   integer NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  -- Relationship type: 'parent' (from is parent of to), 'spouse' (bidirectional)
  relation_type  text NOT NULL CHECK (relation_type IN ('parent', 'spouse')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate edges of the same type between the same two people
CREATE UNIQUE INDEX IF NOT EXISTS family_tree_relations_unique_edge
  ON family_tree_relations (family_id, from_member_id, to_member_id, relation_type);

-- Index for fast lookups by family
CREATE INDEX IF NOT EXISTS idx_family_tree_relations_family
  ON family_tree_relations (family_id);

-- Index for fast lookups by either member
CREATE INDEX IF NOT EXISTS idx_family_tree_relations_from
  ON family_tree_relations (from_member_id);
CREATE INDEX IF NOT EXISTS idx_family_tree_relations_to
  ON family_tree_relations (to_member_id);
