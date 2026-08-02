/*
# Niakofa Legacy Mode — Living World Engine Core Schema

## Overview
Creates the complete database schema for the Niakofa Legacy Mode RPG experience.
This is a single-tenant app (no sign-in required), so all tables use anon+authenticated policies.

## New Tables

1. **legacy_worlds** — One world per family. Tracks the family's game world state, version, and readiness.
2. **legacy_ancestors** — Playable ancestor characters derived from family tree members. Contains birth/death years, locations, story counts, and selection scoring.
3. **legacy_chapters** — Life chapters for each ancestor's story. Generated from timeline events. Has status (locked/unlocked/in_progress/completed).
4. **legacy_scenes** — Interactive scenes within chapters. Each scene has narration, historical layer, and choices.
5. **legacy_choices** — Player choices within scenes. Each choice has stat effects and consequences.
6. **legacy_sessions** — Game sessions tracking player progress through chapters. Stores stats and current state.
7. **legacy_stats** — Player character stats (Knowledge, Relationships, Cultural Wisdom, Courage, Legacy). Capped at 100.
8. **legacy_world_versions** — Knowledge versioning system. Each new upload/memory creates a new version, tracking what changed.
9. **legacy_places** — Family world map locations. Derived from family landmarks, homes, churches, etc.
10. **legacy_quests** — AI-generated quests from family vault data. Each quest has XP, category, and completion state.
11. **legacy_achievements** — Achievement definitions and unlock progress. Tied to meaningful preservation actions.
12. **legacy_inventory_items** — Collectible items with provenance (source, owner, story, unlock reason).
13. **legacy_journal_entries** — Dynamic journal entries created during gameplay.
14. **legacy_dialogues** — AI-generated dialogue lines tied to scenes and characters.

## Security
- RLS enabled on all tables.
- All policies use `TO anon, authenticated` since this is a no-auth single-tenant app.
- All data is intentionally shared/public within the app.
*/

-- ─── 1. Legacy Worlds ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_worlds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       integer NOT NULL DEFAULT 1,
  world_version   integer NOT NULL DEFAULT 1,
  readiness_score integer NOT NULL DEFAULT 0,
  is_ready        boolean NOT NULL DEFAULT false,
  total_chapters  integer NOT NULL DEFAULT 0,
  completed_chapters integer NOT NULL DEFAULT 0,
  total_quests    integer NOT NULL DEFAULT 0,
  completed_quests integer NOT NULL DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE legacy_worlds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_worlds" ON legacy_worlds;
CREATE POLICY "anon_select_worlds" ON legacy_worlds FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_worlds" ON legacy_worlds;
CREATE POLICY "anon_insert_worlds" ON legacy_worlds FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_worlds" ON legacy_worlds;
CREATE POLICY "anon_update_worlds" ON legacy_worlds FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_worlds" ON legacy_worlds;
CREATE POLICY "anon_delete_worlds" ON legacy_worlds FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 2. Legacy Ancestors ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_ancestors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  member_id           integer NOT NULL,
  name                text NOT NULL,
  role                text,
  relation            text,
  birth_year          integer,
  death_year          integer,
  birth_location      text,
  story_count         integer NOT NULL DEFAULT 0,
  event_count         integer NOT NULL DEFAULT 0,
  place_count         integer NOT NULL DEFAULT 0,
  memory_count        integer NOT NULL DEFAULT 0,
  interview_count     integer NOT NULL DEFAULT 0,
  photo_count         integer NOT NULL DEFAULT 0,
  completeness_score  integer NOT NULL DEFAULT 0,
  selection_reason   text,
  is_playable         boolean NOT NULL DEFAULT true,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_ancestors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ancestors" ON legacy_ancestors;
CREATE POLICY "anon_select_ancestors" ON legacy_ancestors FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_ancestors" ON legacy_ancestors;
CREATE POLICY "anon_insert_ancestors" ON legacy_ancestors FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_ancestors" ON legacy_ancestors;
CREATE POLICY "anon_update_ancestors" ON legacy_ancestors FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_ancestors" ON legacy_ancestors;
CREATE POLICY "anon_delete_ancestors" ON legacy_ancestors FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 3. Legacy Chapters ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_chapters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  ancestor_id         uuid REFERENCES legacy_ancestors(id) ON DELETE CASCADE,
  chapter_number      integer NOT NULL DEFAULT 1,
  title               text NOT NULL,
  synopsis            text,
  era                 text,
  year_start          integer,
  year_end            integer,
  location            text,
  status              text NOT NULL DEFAULT 'locked',
  chapter_data        jsonb DEFAULT '{}',
  unlocked_at         timestamptz,
  completed_at        timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_chapters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_chapters" ON legacy_chapters;
CREATE POLICY "anon_select_chapters" ON legacy_chapters FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_chapters" ON legacy_chapters;
CREATE POLICY "anon_insert_chapters" ON legacy_chapters FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_chapters" ON legacy_chapters;
CREATE POLICY "anon_update_chapters" ON legacy_chapters FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_chapters" ON legacy_chapters;
CREATE POLICY "anon_delete_chapters" ON legacy_chapters FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 4. Legacy Scenes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_scenes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id          uuid REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  scene_number        integer NOT NULL DEFAULT 1,
  title               text NOT NULL,
  scene_type          text NOT NULL DEFAULT 'narration',
  content             text NOT NULL,
  narration           text,
  historical_layer    text NOT NULL DEFAULT 'narrative',
  place_id            uuid,
  event_id            integer,
  memory_id           integer,
  is_ai_generated     boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_scenes" ON legacy_scenes;
CREATE POLICY "anon_select_scenes" ON legacy_scenes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_scenes" ON legacy_scenes;
CREATE POLICY "anon_insert_scenes" ON legacy_scenes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_scenes" ON legacy_scenes;
CREATE POLICY "anon_update_scenes" ON legacy_scenes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_scenes" ON legacy_scenes;
CREATE POLICY "anon_delete_scenes" ON legacy_scenes FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 5. Legacy Choices ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_choices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id            uuid REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  choice_number       integer NOT NULL DEFAULT 1,
  label               text NOT NULL,
  description         text,
  stat_effects        jsonb DEFAULT '{}',
  consequence_text    text,
  next_scene_number   integer,
  is_selected         boolean NOT NULL DEFAULT false,
  selected_at         timestamptz,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_choices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_choices" ON legacy_choices;
CREATE POLICY "anon_select_choices" ON legacy_choices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_choices" ON legacy_choices;
CREATE POLICY "anon_insert_choices" ON legacy_choices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_choices" ON legacy_choices;
CREATE POLICY "anon_update_choices" ON legacy_choices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_choices" ON legacy_choices;
CREATE POLICY "anon_delete_choices" ON legacy_choices FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 6. Legacy Sessions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  ancestor_id         uuid REFERENCES legacy_ancestors(id) ON DELETE CASCADE,
  chapter_id          uuid REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  current_scene_number integer NOT NULL DEFAULT 1,
  stats               jsonb NOT NULL DEFAULT '{"knowledge":10,"relationships":10,"cultural_wisdom":10,"courage":10,"legacy":10}',
  choices_made        jsonb DEFAULT '[]',
  journal_entries      jsonb DEFAULT '[]',
  status              text NOT NULL DEFAULT 'active',
  started_at          timestamptz DEFAULT now(),
  completed_at        timestamptz,
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sessions" ON legacy_sessions;
CREATE POLICY "anon_select_sessions" ON legacy_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sessions" ON legacy_sessions;
CREATE POLICY "anon_insert_sessions" ON legacy_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sessions" ON legacy_sessions;
CREATE POLICY "anon_update_sessions" ON legacy_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sessions" ON legacy_sessions;
CREATE POLICY "anon_delete_sessions" ON legacy_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 7. Legacy World Versions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_world_versions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  version_number      integer NOT NULL DEFAULT 1,
  change_summary      text,
  changes             jsonb DEFAULT '{}',
  new_stories         integer NOT NULL DEFAULT 0,
  new_characters      integer NOT NULL DEFAULT 0,
  new_places          integer NOT NULL DEFAULT 0,
  new_quests          integer NOT NULL DEFAULT 0,
  new_chapters        integer NOT NULL DEFAULT 0,
  new_landmarks       integer NOT NULL DEFAULT 0,
  new_collectibles    integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_world_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_select_world_versions" ON legacy_world_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_insert_world_versions" ON legacy_world_versions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_update_world_versions" ON legacy_world_versions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_delete_world_versions" ON legacy_world_versions FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 8. Legacy Places ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_places (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  label               text NOT NULL,
  place_type          text,
  country             text,
  region              text,
  lat                 double precision,
  lng                 double precision,
  notes               text,
  year                integer,
  chapter_numbers     integer[] DEFAULT '{}',
  is_discovered       boolean NOT NULL DEFAULT false,
  discovered_at       timestamptz,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_places" ON legacy_places;
CREATE POLICY "anon_select_places" ON legacy_places FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_places" ON legacy_places;
CREATE POLICY "anon_insert_places" ON legacy_places FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_places" ON legacy_places;
CREATE POLICY "anon_update_places" ON legacy_places FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_places" ON legacy_places;
CREATE POLICY "anon_delete_places" ON legacy_places FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 9. Legacy Quests ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_quests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  xp                  integer NOT NULL DEFAULT 50,
  category            text NOT NULL DEFAULT 'discover',
  action_path         text,
  ancestor_name       text,
  is_ai_generated     boolean NOT NULL DEFAULT false,
  is_completed        boolean NOT NULL DEFAULT false,
  completed_at        timestamptz,
  fingerprint         text,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_quests" ON legacy_quests;
CREATE POLICY "anon_select_quests" ON legacy_quests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_quests" ON legacy_quests;
CREATE POLICY "anon_insert_quests" ON legacy_quests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_quests" ON legacy_quests;
CREATE POLICY "anon_update_quests" ON legacy_quests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_quests" ON legacy_quests;
CREATE POLICY "anon_delete_quests" ON legacy_quests FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 10. Legacy Achievements ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_achievements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  icon_name           text NOT NULL DEFAULT 'Trophy',
  category            text NOT NULL DEFAULT 'preservation',
  current_progress    integer NOT NULL DEFAULT 0,
  target_progress     integer NOT NULL DEFAULT 100,
  is_unlocked         boolean NOT NULL DEFAULT false,
  unlocked_at         timestamptz,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_achievements" ON legacy_achievements;
CREATE POLICY "anon_select_achievements" ON legacy_achievements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_achievements" ON legacy_achievements;
CREATE POLICY "anon_insert_achievements" ON legacy_achievements FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_achievements" ON legacy_achievements;
CREATE POLICY "anon_update_achievements" ON legacy_achievements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_achievements" ON legacy_achievements;
CREATE POLICY "anon_delete_achievements" ON legacy_achievements FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 11. Legacy Inventory Items ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  label               text NOT NULL,
  description         text,
  item_type           text NOT NULL DEFAULT 'artifact',
  icon_name           text NOT NULL DEFAULT 'Crown',
  source              text,
  owner               text,
  year                integer,
  location            text,
  story               text,
  unlock_reason       text,
  is_earned           boolean NOT NULL DEFAULT false,
  earned_at           timestamptz,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inventory" ON legacy_inventory_items;
CREATE POLICY "anon_select_inventory" ON legacy_inventory_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inventory" ON legacy_inventory_items;
CREATE POLICY "anon_insert_inventory" ON legacy_inventory_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inventory" ON legacy_inventory_items;
CREATE POLICY "anon_update_inventory" ON legacy_inventory_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inventory" ON legacy_inventory_items;
CREATE POLICY "anon_delete_inventory" ON legacy_inventory_items FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 12. Legacy Journal Entries ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_journal_entries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid REFERENCES legacy_sessions(id) ON DELETE CASCADE,
  chapter_id          uuid REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  entry_number        integer NOT NULL DEFAULT 1,
  title               text,
  content             text NOT NULL,
  mood                text,
  stats_snapshot      jsonb DEFAULT '{}',
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_journal" ON legacy_journal_entries;
CREATE POLICY "anon_select_journal" ON legacy_journal_entries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_journal" ON legacy_journal_entries;
CREATE POLICY "anon_insert_journal" ON legacy_journal_entries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_journal" ON legacy_journal_entries;
CREATE POLICY "anon_update_journal" ON legacy_journal_entries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_journal" ON legacy_journal_entries;
CREATE POLICY "anon_delete_journal" ON legacy_journal_entries FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 13. Legacy Dialogues ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_dialogues (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id            uuid REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  speaker             text NOT NULL,
  line                text NOT NULL,
  tone                text,
  is_ai_generated     boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_dialogues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_select_dialogues" ON legacy_dialogues FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_insert_dialogues" ON legacy_dialogues FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_update_dialogues" ON legacy_dialogues FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_delete_dialogues" ON legacy_dialogues FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 14. Legacy Family Memories (vault data) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_memories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  memory_date         date,
  location_label       text,
  source              text NOT NULL DEFAULT 'manual',
  ancestor_id         uuid REFERENCES legacy_ancestors(id) ON DELETE SET NULL,
  asset_count         integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_memories" ON legacy_memories;
CREATE POLICY "anon_select_memories" ON legacy_memories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_memories" ON legacy_memories;
CREATE POLICY "anon_insert_memories" ON legacy_memories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_memories" ON legacy_memories;
CREATE POLICY "anon_update_memories" ON legacy_memories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_memories" ON legacy_memories;
CREATE POLICY "anon_delete_memories" ON legacy_memories FOR DELETE
  TO anon, authenticated USING (true);

-- ─── 15. Legacy Family Members (tree data) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_family_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id            uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  display_name        text NOT NULL,
  role                text,
  relation_note       text,
  birth_year          integer,
  death_year          integer,
  location            text,
  is_ancestor         boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE legacy_family_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_family_members" ON legacy_family_members;
CREATE POLICY "anon_select_family_members" ON legacy_family_members FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_members" ON legacy_family_members;
CREATE POLICY "anon_insert_family_members" ON legacy_family_members FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_members" ON legacy_family_members;
CREATE POLICY "anon_update_family_members" ON legacy_family_members FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_members" ON legacy_family_members;
CREATE POLICY "anon_delete_family_members" ON legacy_family_members FOR DELETE
  TO anon, authenticated USING (true);

-- ─── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_legacy_chapters_world ON legacy_chapters(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_scenes_chapter ON legacy_scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_legacy_choices_scene ON legacy_choices(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_world ON legacy_sessions(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_places_world ON legacy_places(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_quests_world ON legacy_quests(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_achievements_world ON legacy_achievements(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_inventory_world ON legacy_inventory_items(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_versions_world ON legacy_world_versions(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_ancestors_world ON legacy_ancestors(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_memories_world ON legacy_memories(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_family_members_world ON legacy_family_members(world_id);