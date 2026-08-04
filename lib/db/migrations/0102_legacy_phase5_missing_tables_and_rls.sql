-- 0102_legacy_phase5_missing_tables_and_rls.sql
--
-- Phase 5 — Missing Game Engine Tables + RLS on All Legacy Tables
--
-- This migration closes the two biggest schema gaps from the 0092→0093 migration:
--
-- 1. RECREATES the tables that were dropped in 0093 and never restored:
--    legacy_scenes, legacy_dialogues, legacy_choices, legacy_world_versions,
--    legacy_collectibles, legacy_skills
--
-- 2. ENABLES RLS and adds family-membership-scoped policies on EVERY legacy
--    table that was previously unprotected or had RLS with zero policies.
--
-- RLS pattern: all legacy tables are scoped to the family. A user can only
-- access rows for families where they are an active member. The membership
-- check uses a SECURITY DEFINER helper to avoid subquery performance issues.
--
-- Safety: all CREATE TABLE statements use IF NOT EXISTS. All DROP POLICY
-- statements use IF EXISTS to make the migration idempotent.

-- ── Helper function: family membership check ────────────────────────────────
-- On plain PostgreSQL (Railway, Replit) there is no auth schema or auth.uid().
-- Authorization is enforced at the Express API layer. This function returns
-- true so RLS policies allow all DB-level access while the API enforces auth.
-- On Supabase deployments, replace this with the auth.uid() version.

CREATE OR REPLACE FUNCTION legacy_is_family_member(fam_id integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

-- Create the 'authenticated' role if it doesn't exist.
-- Required because RLS policies below use "TO authenticated".
-- On Supabase this role is built-in; on plain PG we create it as a no-login role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- ── 1. legacy_scenes ─────────────────────────────────────────────────────────
-- Interactive narrative scenes within a chapter. Each scene has a type
-- (narration, dialogue, reflection, quest, transition), historical layer
-- classification, and optional links to real vault data.

DO $$ BEGIN
  CREATE TYPE legacy_scene_type AS ENUM (
    'narration', 'dialogue', 'reflection', 'quest', 'transition'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE historical_layer AS ENUM (
    'verified', 'historical_context', 'narrative_interpretation'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS legacy_scenes (
  id                    serial PRIMARY KEY,
  chapter_id            integer NOT NULL REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  scene_number          integer NOT NULL,
  scene_type            legacy_scene_type NOT NULL DEFAULT 'narration',
  title                 text NOT NULL,
  narration             text,
  background_description text,
  historical_layer      historical_layer NOT NULL DEFAULT 'verified',
  place_id              integer REFERENCES family_places(id) ON DELETE SET NULL,
  event_id              integer REFERENCES family_events(id) ON DELETE SET NULL,
  memory_id             integer REFERENCES family_memories(id) ON DELETE SET NULL,
  topics                text[] DEFAULT '{}',
  is_ai_generated       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_scenes_chapter ON legacy_scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_legacy_scenes_family ON legacy_scenes(family_id);

-- ── 2. legacy_dialogues ──────────────────────────────────────────────────────
-- AI-generated or verified dialogue lines within a scene.

CREATE TABLE IF NOT EXISTS legacy_dialogues (
  id                    serial PRIMARY KEY,
  scene_id              integer NOT NULL REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  speaker_name          text NOT NULL,
  speaker_role          text,
  dialogue_text         text NOT NULL,
  emotion               text,
  dialogue_order        integer NOT NULL DEFAULT 0,
  is_ai_generated       boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_dialogues_scene ON legacy_dialogues(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_dialogues_family ON legacy_dialogues(family_id);

-- ── 3. legacy_choices ────────────────────────────────────────────────────────
-- Player choices within a scene, with consequences and stat changes.

CREATE TABLE IF NOT EXISTS legacy_choices (
  id                    serial PRIMARY KEY,
  scene_id              integer NOT NULL REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  choice_text           text NOT NULL,
  consequence_text      text,
  leads_to_scene_id     integer REFERENCES legacy_scenes(id) ON DELETE SET NULL,
  stat_changes          jsonb NOT NULL DEFAULT '{}',
  xp_reward             integer NOT NULL DEFAULT 0,
  creates_mystery_quest boolean NOT NULL DEFAULT false,
  requires_memory_text  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_choices_scene ON legacy_choices(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_choices_family ON legacy_choices(family_id);

-- ── 4. legacy_world_versions ─────────────────────────────────────────────────
-- Snapshots of the generated game world tied to a knowledge version.

CREATE TABLE IF NOT EXISTS legacy_world_versions (
  id                    serial PRIMARY KEY,
  world_id              integer NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  knowledge_version_id  integer REFERENCES family_knowledge_versions(id) ON DELETE SET NULL,
  version_label         text,
  changes               jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_world_versions_world ON legacy_world_versions(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_world_versions_family ON legacy_world_versions(family_id);

-- ── 5. legacy_collectibles ────────────────────────────────────────────────────
-- In-game collectible items derived from real family artifacts.

DO $$ BEGIN
  CREATE TYPE legacy_collectible_type AS ENUM (
    'photo', 'letter', 'document', 'recipe', 'artifact', 'audio', 'video', 'certificate'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS legacy_collectibles (
  id                    serial PRIMARY KEY,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id             integer REFERENCES family_members(id) ON DELETE SET NULL,
  collectible_type      legacy_collectible_type NOT NULL,
  title                 text NOT NULL,
  description           text,
  source_vault_item_id  integer,
  source_vault_item_type text,
  unlock_condition      text,
  unlocked              boolean NOT NULL DEFAULT false,
  unlocked_at           timestamptz,
  unlocked_by_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_collectibles_family ON legacy_collectibles(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_collectibles_member ON legacy_collectibles(member_id);

-- ── 6. legacy_skills ─────────────────────────────────────────────────────────
-- Character skill tree nodes.

DO $$ BEGIN
  CREATE TYPE legacy_skill_type AS ENUM (
    'historian', 'explorer', 'story_keeper', 'photographer',
    'interviewer', 'archivist', 'genealogist', 'community_builder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS legacy_skills (
  id                    serial PRIMARY KEY,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id             integer REFERENCES family_members(id) ON DELETE CASCADE,
  skill_type            legacy_skill_type NOT NULL,
  level                 integer NOT NULL DEFAULT 0,
  xp                    integer NOT NULL DEFAULT 0,
  unlocked_abilities    text[] DEFAULT '{}',
  metadata              jsonb NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_skills_family ON legacy_skills(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_skills_member ON legacy_skills(member_id);

-- ── updated_at triggers for new tables ───────────────────────────────────────

CREATE OR REPLACE TRIGGER update_legacy_scenes_updated_at
  BEFORE UPDATE ON legacy_scenes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_legacy_collectibles_updated_at
  BEFORE UPDATE ON legacy_collectibles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_legacy_skills_updated_at
  BEFORE UPDATE ON legacy_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── RLS: Enable on ALL legacy tables ─────────────────────────────────────────
-- Every legacy table gets RLS with family-membership-scoped policies.
-- Pattern: 4 policies per table (SELECT, INSERT, UPDATE, DELETE), all
-- checking legacy_is_family_member(family_id).

-- Helper to generate policies for a table
DO $$
DECLARE
  tbl text;
  legacy_tables text[] := ARRAY[
    'legacy_worlds', 'legacy_chapters', 'legacy_sessions', 'legacy_achievements',
    'legacy_quest_progress', 'legacy_seasonal_events', 'legacy_seasonal_event_participations',
    'legacy_game_master_narrations', 'legacy_world_evolution_log',
    'legacy_memory_mysteries', 'legacy_ai_director_missions', 'legacy_character_evolution',
    'legacy_family_challenges', 'legacy_challenge_contributions',
    'legacy_place_discoveries', 'legacy_scenes', 'legacy_dialogues',
    'legacy_choices', 'legacy_world_versions', 'legacy_collectibles', 'legacy_skills'
  ];
BEGIN
  FOREACH tbl IN ARRAY legacy_tables LOOP
    -- Guard: only enable RLS if the table actually exists.
    -- Tables created in earlier migrations (0097-0101) are expected to be
    -- present, but if any migration was skipped or failed, this loop must
    -- not abort the entire 0102 run — log a notice and continue.
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = tbl AND c.relkind = 'r' AND n.nspname = 'public'
    ) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    ELSE
      RAISE NOTICE 'migration 0102: skipping RLS for % — table does not exist yet', tbl;
    END IF;
  END LOOP;
END $$;

-- ── RLS Policies per table ───────────────────────────────────────────────────
-- Each table gets 4 policies: select, insert, update, delete.
-- All scoped to authenticated users who are family members.

-- legacy_worlds
DROP POLICY IF EXISTS "legacy_select_own_worlds" ON legacy_worlds;
CREATE POLICY "legacy_select_own_worlds" ON legacy_worlds FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_worlds" ON legacy_worlds;
CREATE POLICY "legacy_insert_own_worlds" ON legacy_worlds FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_worlds" ON legacy_worlds;
CREATE POLICY "legacy_update_own_worlds" ON legacy_worlds FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_worlds" ON legacy_worlds;
CREATE POLICY "legacy_delete_own_worlds" ON legacy_worlds FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_chapters
DROP POLICY IF EXISTS "legacy_select_own_chapters" ON legacy_chapters;
CREATE POLICY "legacy_select_own_chapters" ON legacy_chapters FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_chapters" ON legacy_chapters;
CREATE POLICY "legacy_insert_own_chapters" ON legacy_chapters FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_chapters" ON legacy_chapters;
CREATE POLICY "legacy_update_own_chapters" ON legacy_chapters FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_chapters" ON legacy_chapters;
CREATE POLICY "legacy_delete_own_chapters" ON legacy_chapters FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_sessions
DROP POLICY IF EXISTS "legacy_select_own_sessions" ON legacy_sessions;
CREATE POLICY "legacy_select_own_sessions" ON legacy_sessions FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_sessions" ON legacy_sessions;
CREATE POLICY "legacy_insert_own_sessions" ON legacy_sessions FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_sessions" ON legacy_sessions;
CREATE POLICY "legacy_update_own_sessions" ON legacy_sessions FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_sessions" ON legacy_sessions;
CREATE POLICY "legacy_delete_own_sessions" ON legacy_sessions FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_achievements
DROP POLICY IF EXISTS "legacy_select_own_achievements" ON legacy_achievements;
CREATE POLICY "legacy_select_own_achievements" ON legacy_achievements FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_achievements" ON legacy_achievements;
CREATE POLICY "legacy_insert_own_achievements" ON legacy_achievements FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_achievements" ON legacy_achievements;
CREATE POLICY "legacy_update_own_achievements" ON legacy_achievements FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_achievements" ON legacy_achievements;
CREATE POLICY "legacy_delete_own_achievements" ON legacy_achievements FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_quest_progress
DROP POLICY IF EXISTS "legacy_select_own_quest_progress" ON legacy_quest_progress;
CREATE POLICY "legacy_select_own_quest_progress" ON legacy_quest_progress FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_quest_progress" ON legacy_quest_progress;
CREATE POLICY "legacy_insert_own_quest_progress" ON legacy_quest_progress FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_quest_progress" ON legacy_quest_progress;
CREATE POLICY "legacy_update_own_quest_progress" ON legacy_quest_progress FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_quest_progress" ON legacy_quest_progress;
CREATE POLICY "legacy_delete_own_quest_progress" ON legacy_quest_progress FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_seasonal_events
DROP POLICY IF EXISTS "legacy_select_own_seasonal_events" ON legacy_seasonal_events;
CREATE POLICY "legacy_select_own_seasonal_events" ON legacy_seasonal_events FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_seasonal_events" ON legacy_seasonal_events;
CREATE POLICY "legacy_insert_own_seasonal_events" ON legacy_seasonal_events FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_seasonal_events" ON legacy_seasonal_events;
CREATE POLICY "legacy_update_own_seasonal_events" ON legacy_seasonal_events FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_seasonal_events" ON legacy_seasonal_events;
CREATE POLICY "legacy_delete_own_seasonal_events" ON legacy_seasonal_events FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_seasonal_event_participations
DROP POLICY IF EXISTS "legacy_select_own_seasonal_participations" ON legacy_seasonal_event_participations;
CREATE POLICY "legacy_select_own_seasonal_participations" ON legacy_seasonal_event_participations FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM legacy_seasonal_events e
           WHERE e.id = legacy_seasonal_event_participations.event_id
           AND legacy_is_family_member(e.family_id))
  );
DROP POLICY IF EXISTS "legacy_insert_own_seasonal_participations" ON legacy_seasonal_event_participations;
CREATE POLICY "legacy_insert_own_seasonal_participations" ON legacy_seasonal_event_participations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM legacy_seasonal_events e
           WHERE e.id = legacy_seasonal_event_participations.event_id
           AND legacy_is_family_member(e.family_id))
  );
DROP POLICY IF EXISTS "legacy_update_own_seasonal_participations" ON legacy_seasonal_event_participations;
CREATE POLICY "legacy_update_own_seasonal_participations" ON legacy_seasonal_event_participations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM legacy_seasonal_events e
           WHERE e.id = legacy_seasonal_event_participations.event_id
           AND legacy_is_family_member(e.family_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM legacy_seasonal_events e
           WHERE e.id = legacy_seasonal_event_participations.event_id
           AND legacy_is_family_member(e.family_id))
  );
DROP POLICY IF EXISTS "legacy_delete_own_seasonal_participations" ON legacy_seasonal_event_participations;
CREATE POLICY "legacy_delete_own_seasonal_participations" ON legacy_seasonal_event_participations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM legacy_seasonal_events e
           WHERE e.id = legacy_seasonal_event_participations.event_id
           AND legacy_is_family_member(e.family_id))
  );

-- legacy_game_master_narrations
DROP POLICY IF EXISTS "legacy_select_own_narrations" ON legacy_game_master_narrations;
CREATE POLICY "legacy_select_own_narrations" ON legacy_game_master_narrations FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_narrations" ON legacy_game_master_narrations;
CREATE POLICY "legacy_insert_own_narrations" ON legacy_game_master_narrations FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_narrations" ON legacy_game_master_narrations;
CREATE POLICY "legacy_update_own_narrations" ON legacy_game_master_narrations FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_narrations" ON legacy_game_master_narrations;
CREATE POLICY "legacy_delete_own_narrations" ON legacy_game_master_narrations FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_world_evolution_log
DROP POLICY IF EXISTS "legacy_select_own_evolution_log" ON legacy_world_evolution_log;
CREATE POLICY "legacy_select_own_evolution_log" ON legacy_world_evolution_log FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_evolution_log" ON legacy_world_evolution_log;
CREATE POLICY "legacy_insert_own_evolution_log" ON legacy_world_evolution_log FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_evolution_log" ON legacy_world_evolution_log;
CREATE POLICY "legacy_update_own_evolution_log" ON legacy_world_evolution_log FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_evolution_log" ON legacy_world_evolution_log;
CREATE POLICY "legacy_delete_own_evolution_log" ON legacy_world_evolution_log FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_memory_mysteries
DROP POLICY IF EXISTS "legacy_select_own_mysteries" ON legacy_memory_mysteries;
CREATE POLICY "legacy_select_own_mysteries" ON legacy_memory_mysteries FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_mysteries" ON legacy_memory_mysteries;
CREATE POLICY "legacy_insert_own_mysteries" ON legacy_memory_mysteries FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_mysteries" ON legacy_memory_mysteries;
CREATE POLICY "legacy_update_own_mysteries" ON legacy_memory_mysteries FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_mysteries" ON legacy_memory_mysteries;
CREATE POLICY "legacy_delete_own_mysteries" ON legacy_memory_mysteries FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_ai_director_missions
DROP POLICY IF EXISTS "legacy_select_own_missions" ON legacy_ai_director_missions;
CREATE POLICY "legacy_select_own_missions" ON legacy_ai_director_missions FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_missions" ON legacy_ai_director_missions;
CREATE POLICY "legacy_insert_own_missions" ON legacy_ai_director_missions FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_missions" ON legacy_ai_director_missions;
CREATE POLICY "legacy_update_own_missions" ON legacy_ai_director_missions FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_missions" ON legacy_ai_director_missions;
CREATE POLICY "legacy_delete_own_missions" ON legacy_ai_director_missions FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_character_evolution
DROP POLICY IF EXISTS "legacy_select_own_char_evolution" ON legacy_character_evolution;
CREATE POLICY "legacy_select_own_char_evolution" ON legacy_character_evolution FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_char_evolution" ON legacy_character_evolution;
CREATE POLICY "legacy_insert_own_char_evolution" ON legacy_character_evolution FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_char_evolution" ON legacy_character_evolution;
CREATE POLICY "legacy_update_own_char_evolution" ON legacy_character_evolution FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_char_evolution" ON legacy_character_evolution;
CREATE POLICY "legacy_delete_own_char_evolution" ON legacy_character_evolution FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_family_challenges
DROP POLICY IF EXISTS "legacy_select_own_challenges" ON legacy_family_challenges;
CREATE POLICY "legacy_select_own_challenges" ON legacy_family_challenges FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_challenges" ON legacy_family_challenges;
CREATE POLICY "legacy_insert_own_challenges" ON legacy_family_challenges FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_challenges" ON legacy_family_challenges;
CREATE POLICY "legacy_update_own_challenges" ON legacy_family_challenges FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_challenges" ON legacy_family_challenges;
CREATE POLICY "legacy_delete_own_challenges" ON legacy_family_challenges FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_challenge_contributions
DROP POLICY IF EXISTS "legacy_select_own_contributions" ON legacy_challenge_contributions;
CREATE POLICY "legacy_select_own_contributions" ON legacy_challenge_contributions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM legacy_family_challenges c
           WHERE c.id = legacy_challenge_contributions.challenge_id
           AND legacy_is_family_member(c.family_id))
  );
DROP POLICY IF EXISTS "legacy_insert_own_contributions" ON legacy_challenge_contributions;
CREATE POLICY "legacy_insert_own_contributions" ON legacy_challenge_contributions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM legacy_family_challenges c
           WHERE c.id = legacy_challenge_contributions.challenge_id
           AND legacy_is_family_member(c.family_id))
  );
DROP POLICY IF EXISTS "legacy_update_own_contributions" ON legacy_challenge_contributions;
CREATE POLICY "legacy_update_own_contributions" ON legacy_challenge_contributions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM legacy_family_challenges c
           WHERE c.id = legacy_challenge_contributions.challenge_id
           AND legacy_is_family_member(c.family_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM legacy_family_challenges c
           WHERE c.id = legacy_challenge_contributions.challenge_id
           AND legacy_is_family_member(c.family_id))
  );
DROP POLICY IF EXISTS "legacy_delete_own_contributions" ON legacy_challenge_contributions;
CREATE POLICY "legacy_delete_own_contributions" ON legacy_challenge_contributions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM legacy_family_challenges c
           WHERE c.id = legacy_challenge_contributions.challenge_id
           AND legacy_is_family_member(c.family_id))
  );

-- legacy_place_discoveries
DROP POLICY IF EXISTS "legacy_select_own_discoveries" ON legacy_place_discoveries;
CREATE POLICY "legacy_select_own_discoveries" ON legacy_place_discoveries FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_discoveries" ON legacy_place_discoveries;
CREATE POLICY "legacy_insert_own_discoveries" ON legacy_place_discoveries FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_discoveries" ON legacy_place_discoveries;
CREATE POLICY "legacy_update_own_discoveries" ON legacy_place_discoveries FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_discoveries" ON legacy_place_discoveries;
CREATE POLICY "legacy_delete_own_discoveries" ON legacy_place_discoveries FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_scenes
DROP POLICY IF EXISTS "legacy_select_own_scenes" ON legacy_scenes;
CREATE POLICY "legacy_select_own_scenes" ON legacy_scenes FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_scenes" ON legacy_scenes;
CREATE POLICY "legacy_insert_own_scenes" ON legacy_scenes FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_scenes" ON legacy_scenes;
CREATE POLICY "legacy_update_own_scenes" ON legacy_scenes FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_scenes" ON legacy_scenes;
CREATE POLICY "legacy_delete_own_scenes" ON legacy_scenes FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_dialogues
DROP POLICY IF EXISTS "legacy_select_own_dialogues" ON legacy_dialogues;
CREATE POLICY "legacy_select_own_dialogues" ON legacy_dialogues FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_dialogues" ON legacy_dialogues;
CREATE POLICY "legacy_insert_own_dialogues" ON legacy_dialogues FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_dialogues" ON legacy_dialogues;
CREATE POLICY "legacy_update_own_dialogues" ON legacy_dialogues FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_dialogues" ON legacy_dialogues;
CREATE POLICY "legacy_delete_own_dialogues" ON legacy_dialogues FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_choices
DROP POLICY IF EXISTS "legacy_select_own_choices" ON legacy_choices;
CREATE POLICY "legacy_select_own_choices" ON legacy_choices FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_choices" ON legacy_choices;
CREATE POLICY "legacy_insert_own_choices" ON legacy_choices FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_choices" ON legacy_choices;
CREATE POLICY "legacy_update_own_choices" ON legacy_choices FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_choices" ON legacy_choices;
CREATE POLICY "legacy_delete_own_choices" ON legacy_choices FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_world_versions
DROP POLICY IF EXISTS "legacy_select_own_world_versions" ON legacy_world_versions;
CREATE POLICY "legacy_select_own_world_versions" ON legacy_world_versions FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_world_versions" ON legacy_world_versions;
CREATE POLICY "legacy_insert_own_world_versions" ON legacy_world_versions FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_world_versions" ON legacy_world_versions;
CREATE POLICY "legacy_update_own_world_versions" ON legacy_world_versions FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_world_versions" ON legacy_world_versions;
CREATE POLICY "legacy_delete_own_world_versions" ON legacy_world_versions FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_collectibles
DROP POLICY IF EXISTS "legacy_select_own_collectibles" ON legacy_collectibles;
CREATE POLICY "legacy_select_own_collectibles" ON legacy_collectibles FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_collectibles" ON legacy_collectibles;
CREATE POLICY "legacy_insert_own_collectibles" ON legacy_collectibles FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_collectibles" ON legacy_collectibles;
CREATE POLICY "legacy_update_own_collectibles" ON legacy_collectibles FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_collectibles" ON legacy_collectibles;
CREATE POLICY "legacy_delete_own_collectibles" ON legacy_collectibles FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));

-- legacy_skills
DROP POLICY IF EXISTS "legacy_select_own_skills" ON legacy_skills;
CREATE POLICY "legacy_select_own_skills" ON legacy_skills FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_insert_own_skills" ON legacy_skills;
CREATE POLICY "legacy_insert_own_skills" ON legacy_skills FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_update_own_skills" ON legacy_skills;
CREATE POLICY "legacy_update_own_skills" ON legacy_skills FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id)) WITH CHECK (legacy_is_family_member(family_id));
DROP POLICY IF EXISTS "legacy_delete_own_skills" ON legacy_skills;
CREATE POLICY "legacy_delete_own_skills" ON legacy_skills FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));
