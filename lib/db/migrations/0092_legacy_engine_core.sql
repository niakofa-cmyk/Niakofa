-- ── Enum types ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE legacy_world_status AS ENUM ('generating', 'ready', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_chapter_status AS ENUM ('locked', 'unlocked', 'in_progress', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_session_status AS ENUM ('active', 'paused', 'completed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_achievement_category AS ENUM ('vault_prompt', 'reconnection', 'gameplay', 'preservation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_scene_type AS ENUM ('narration', 'dialogue', 'reflection', 'quest', 'transition');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE historical_layer AS ENUM ('verified', 'historical_context', 'narrative_interpretation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_quest_type AS ENUM ('mystery', 'preservation', 'reconnection', 'exploration', 'cultural');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_quest_status AS ENUM ('available', 'in_progress', 'completed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Family Vault Tables ─────────────────────────────────────────────────────
--
-- NOTE (migration 0093 context): family_members already exists from
-- migration 0079 with a SERIAL INTEGER PK. The CREATE TABLE IF NOT EXISTS
-- below is silently skipped. We add the legacy-game columns via ALTER TABLE
-- before anything references them.
--
-- family_places, family_events, family_artifacts are NOT created here.
-- They are created with correct serial integer PKs in migration 0093 so
-- that downstream migrations (0096+) can reference them with integer FKs.

-- Add legacy game-specific columns to family_members if they don't exist yet.
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS birth_year TEXT,
  ADD COLUMN IF NOT EXISTS death_year TEXT,
  ADD COLUMN IF NOT EXISTS birth_place TEXT,
  ADD COLUMN IF NOT EXISTS generation INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS storytelling_consent BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  role text,
  relation_note text,
  birth_year text,
  death_year text,
  birth_place text,
  generation int DEFAULT 0,
  photo_url text,
  bio text,
  storytelling_consent boolean DEFAULT false,
  is_living boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Family Memories ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  memory_type text DEFAULT 'story',
  media_url text,
  media_type text,
  tags text[] DEFAULT '{}',
  linked_members uuid[] DEFAULT '{}',
  location text,
  memory_year text,
  is_private boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Family Places / Events / Interviews / Artifacts ──────────────────────────
-- These tables are intentionally NOT created here with uuid PKs.
-- family_places and family_events are created with serial integer PKs in
-- migration 0093 (schema reconciliation). family_interviews already exists
-- from migration 0082. family_artifacts is created in migration 0093.
-- Skipping here prevents the type-mismatch FK errors in migrations 0096+.

-- ── Legacy Worlds ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  user_id text,
  title text NOT NULL,
  description text,
  status legacy_world_status DEFAULT 'generating',
  cover_image_url text,
  theme jsonb DEFAULT '{}',
  completeness_score int DEFAULT 0,
  last_played_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Legacy Chapters ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  description text,
  chapter_number int NOT NULL DEFAULT 1,
  status legacy_chapter_status DEFAULT 'locked',
  era_start text,
  era_end text,
  ancestor_focus INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  cover_image_url text,
  unlock_condition jsonb DEFAULT '{}',
  completion_reward jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Legacy Scenes ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  scene_number int NOT NULL DEFAULT 1,
  scene_type legacy_scene_type DEFAULT 'narration',
  title text,
  narration text,
  background_description text,
  historical_layer historical_layer DEFAULT 'narrative_interpretation',
  evidence_link INTEGER REFERENCES family_memories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- ── Legacy Dialogues ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_dialogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  speaker_name text NOT NULL,
  speaker_role text,
  dialogue_text text NOT NULL,
  emotion text,
  dialogue_order int DEFAULT 0,
  is_ai_generated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── Legacy Choices ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  choice_text text NOT NULL,
  consequence_text text,
  leads_to_scene_id uuid REFERENCES legacy_scenes(id) ON DELETE SET NULL,
  xp_reward int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Legacy Sessions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  current_chapter_id uuid REFERENCES legacy_chapters(id) ON DELETE SET NULL,
  current_scene_id uuid REFERENCES legacy_scenes(id) ON DELETE SET NULL,
  status legacy_session_status DEFAULT 'active',
  xp_earned int DEFAULT 0,
  choices_made jsonb DEFAULT '[]',
  started_at timestamptz DEFAULT now(),
  last_active_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- ── Legacy Achievements ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  description text,
  category legacy_achievement_category DEFAULT 'gameplay',
  icon_name text,
  xp_reward int DEFAULT 50,
  max_progress int DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- ── Legacy User Achievements ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  achievement_id uuid NOT NULL REFERENCES legacy_achievements(id) ON DELETE CASCADE,
  progress int DEFAULT 0,
  unlocked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);

-- ── Legacy Quests ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  quest_type legacy_quest_type DEFAULT 'mystery',
  status legacy_quest_status DEFAULT 'available',
  xp_reward int DEFAULT 100,
  steps jsonb DEFAULT '[]',
  completion_condition jsonb DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Legacy Quest Progress ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_quest_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES legacy_quests(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  current_step int DEFAULT 0,
  completed_steps jsonb DEFAULT '[]',
  status legacy_quest_status DEFAULT 'in_progress',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(quest_id, user_id)
);

-- ── Family Knowledge Versions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  version_hash text NOT NULL,
  member_count int DEFAULT 0,
  memory_count int DEFAULT 0,
  place_count int DEFAULT 0,
  event_count int DEFAULT 0,
  interview_count int DEFAULT 0,
  artifact_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Legacy World Versions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_world_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  knowledge_version_id uuid REFERENCES family_knowledge_versions(id) ON DELETE SET NULL,
  version_label text,
  changes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Note: indexes for family_places, family_events, family_artifacts are
-- created in migration 0093 alongside those tables (integer-PK versions).

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_memories_family_id ON family_memories(family_id);
CREATE INDEX IF NOT EXISTS idx_family_interviews_family_id ON family_interviews(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_worlds_family_id ON legacy_worlds(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_chapters_world_id ON legacy_chapters(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_scenes_chapter_id ON legacy_scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_legacy_dialogues_scene_id ON legacy_dialogues(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_choices_scene_id ON legacy_choices(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_world_id ON legacy_sessions(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_quests_world_id ON legacy_quests(world_id);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_versions_family_id ON family_knowledge_versions(family_id);

-- ── Seed: Default Achievements ───────────────────────────────────────────────
-- Wrapped in DO block — legacy_achievements is dropped/recreated by 0093
-- with a different schema, so these rows will be gone after 0093. That is
-- expected. The DO block prevents a crash if there is a schema mismatch.

DO $$
BEGIN
  INSERT INTO legacy_achievements (title, description, category, icon_name, max_progress)
  VALUES
    ('Ancestor Walker', 'Visit three locations connected to an ancestor.', 'gameplay', 'Map', 3),
    ('Voice of the Elders', 'Record five oral histories.', 'preservation', 'Mic', 5),
    ('Memory Detective', 'Identify the people in ten unknown photographs.', 'vault_prompt', 'Camera', 10),
    ('Migration Trail', 'Recreate an ancestor''s migration route.', 'gameplay', 'Globe2', 5),
    ('Family Bridge', 'Reconnect two previously disconnected relatives.', 'reconnection', 'Users', 2),
    ('Keeper of the Flame', 'Preserve a family tradition and teach it to another generation.', 'preservation', 'Flame', 1),
    ('Story Keeper', 'Record 100 family memories.', 'preservation', 'BookHeart', 100),
    ('Roots Explorer', 'Explore 10 family locations.', 'gameplay', 'Map', 10),
    ('Family Connector', 'Add 5 family members to the tree.', 'vault_prompt', 'Users', 5),
    ('Legacy Builder', 'Complete your first full chapter.', 'gameplay', 'Crown', 1)
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  NULL; -- schema mismatch with 0093 schema is expected; skip gracefully
END $$;

-- ── Seed: Sample Family Data ─────────────────────────────────────────────────
-- All wrapped in a single DO block. These inserts reference the family_members
-- table (which exists from 0079 with INTEGER PK) but require:
--   - a valid family_id (NOT NULL in 0079) — we create a seed family first
--   - relation_note instead of role (role is a typed enum, not plain text)
--   - birth_year, birth_place, generation, bio, storytelling_consent columns
--     (added via ALTER TABLE at the top of this migration)
-- family_places, family_events, family_artifacts don't exist yet;
-- they are created in 0093. All errors are suppressed so a schema evolution
-- never blocks migrations.

DO $$
DECLARE
  v_family_id INTEGER;
BEGIN
  -- Create a demo/seed family (used only for dev sample data)
  INSERT INTO families (name, description)
  VALUES ('Niakofa Demo Family', 'Sample ancestors for Legacy Mode demo')
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_family_id FROM families
  WHERE name = 'Niakofa Demo Family' LIMIT 1;

  IF v_family_id IS NOT NULL THEN
    INSERT INTO family_members (family_id, display_name, relation_note, birth_year, birth_place, generation, bio, storytelling_consent)
    VALUES
      (v_family_id, 'Ama Serwaa', 'Ancestor', '1898', 'Cape Coast, Ghana', 1,
       'Ama loved school, but her father expected her to help with the family business. She was known for her sharp memory and kindness.', true),
      (v_family_id, 'Kofi Mensah', 'Ancestor', '1890', 'Kumasi, Ghana', 1,
       'Kofi was a trader who traveled between Cape Coast and Kumasi. He spoke three languages.', true),
      (v_family_id, 'Adwoa Serwaa', 'Elder', '1925', 'Cape Coast, Ghana', 2,
       'Adwoa was Ama''s daughter. She became a teacher at the mission school.', true),
      (v_family_id, 'Kwame Mensah', 'Elder', '1928', 'Accra, Ghana', 2,
       'Kwame moved to Accra in 1948 to work in the new government offices.', true),
      (v_family_id, 'Mary Johnson', 'Elder', '1932', 'Detroit, USA', 3,
       'Mary migrated to Detroit in 1957. She worked at Ford and was active in her church choir.', true)
    ON CONFLICT DO NOTHING;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- seed data failure must never block migrations
END $$;
