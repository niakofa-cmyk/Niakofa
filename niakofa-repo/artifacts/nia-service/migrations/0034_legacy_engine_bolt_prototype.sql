-- ─────────────────────────────────────────────────────────────────────────────
-- Niakofa — Legacy Engine Core Schema (Bolt Prototype)
--
-- Creates the full Legacy Engine domain: family vault tables,
-- legacy worlds, chapters, scenes, dialogues, choices, consequences,
-- sessions, quests, achievements, artifacts, and knowledge versioning.
--
-- This migration is applied via the Supabase MCP apply_migration tool.
-- It is idempotent (IF NOT EXISTS) and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- ── Family Memories ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  title text,
  description text NOT NULL,
  memory_type text DEFAULT 'story',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE family_memories ENABLE ROW LEVEL SECURITY;

-- ── Family Places ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  label text NOT NULL,
  country text,
  region text,
  latitude float8,
  longitude float8,
  historical_context text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_places ENABLE ROW LEVEL SECURITY;

-- ── Family Events ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  event_date date,
  event_year text,
  place_id uuid REFERENCES family_places(id) ON DELETE SET NULL,
  event_type text DEFAULT 'life',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_events ENABLE ROW LEVEL SECURITY;

-- ── Family Interviews ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  interviewer text,
  transcript text,
  audio_url text,
  duration_seconds int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_interviews ENABLE ROW LEVEL SECURITY;

-- ── Family Artifacts (heirlooms) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  artifact_type text DEFAULT 'heirloom',
  date_origin text,
  location text,
  photo_url text,
  story text,
  unlocked_by text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_artifacts ENABLE ROW LEVEL SECURITY;

-- ── Legacy Worlds ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  status legacy_world_status DEFAULT 'generating',
  knowledge_version_id uuid,
  world_data jsonb DEFAULT '{}',
  ancestor_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  ancestor_name text,
  ancestor_birth_year text,
  ancestor_birth_place text,
  chapter_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_worlds ENABLE ROW LEVEL SECURITY;

-- ── Legacy Chapters ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  chapter_number int NOT NULL,
  title text NOT NULL,
  description text,
  status legacy_chapter_status DEFAULT 'locked',
  unlock_threshold int DEFAULT 40,
  scene_count int DEFAULT 0,
  era_label text,
  location_label text,
  year_label text,
  historical_context text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_chapters ENABLE ROW LEVEL SECURITY;

-- ── Legacy Scenes ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  scene_number int NOT NULL,
  title text NOT NULL,
  type legacy_scene_type DEFAULT 'narration',
  content text NOT NULL,
  place_id uuid REFERENCES family_places(id) ON DELETE SET NULL,
  event_id uuid REFERENCES family_events(id) ON DELETE SET NULL,
  memory_id uuid REFERENCES family_memories(id) ON DELETE SET NULL,
  historical_layer historical_layer DEFAULT 'narrative_interpretation',
  time_of_day text,
  atmosphere text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_scenes ENABLE ROW LEVEL SECURITY;

-- ── Legacy Dialogues ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_dialogues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  speaker text NOT NULL,
  speaker_relation text,
  line text NOT NULL,
  tone text DEFAULT 'neutral',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_dialogues ENABLE ROW LEVEL SECURITY;

-- ── Legacy Choices ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id uuid NOT NULL REFERENCES legacy_scenes(id) ON DELETE CASCADE,
  choice_number int NOT NULL,
  text text NOT NULL,
  consequence text NOT NULL,
  action text DEFAULT 'next',
  stat_effects jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_choices ENABLE ROW LEVEL SECURITY;

-- ── Legacy Sessions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES legacy_chapters(id) ON DELETE SET NULL,
  scene_index int DEFAULT 0,
  status legacy_session_status DEFAULT 'active',
  stats jsonb DEFAULT '{"knowledge":0,"relationships":0,"cultural_wisdom":0,"courage":0,"reputation":0,"legacy":0}',
  choices_made jsonb DEFAULT '[]',
  memories_created int DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE legacy_sessions ENABLE ROW LEVEL SECURITY;

-- ── Legacy Quests ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  family_id uuid,
  member_id uuid REFERENCES family_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  quest_type legacy_quest_type DEFAULT 'mystery',
  status legacy_quest_status DEFAULT 'available',
  prompt text,
  reward text,
  knowledge_gap text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_quests ENABLE ROW LEVEL SECURITY;

-- ── Legacy Quest Progress ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_quest_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id uuid NOT NULL REFERENCES legacy_quests(id) ON DELETE CASCADE,
  session_id uuid REFERENCES legacy_sessions(id) ON DELETE CASCADE,
  status legacy_quest_status DEFAULT 'available',
  progress_data jsonb DEFAULT '{}',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_quest_progress ENABLE ROW LEVEL SECURITY;

-- ── Legacy Achievements ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category legacy_achievement_category DEFAULT 'gameplay',
  icon_name text DEFAULT 'Trophy',
  max_progress int DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_achievements ENABLE ROW LEVEL SECURITY;

-- ── Legacy Achievement Progress ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_achievement_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id uuid NOT NULL REFERENCES legacy_achievements(id) ON DELETE CASCADE,
  world_id uuid REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  current_progress int DEFAULT 0,
  unlocked boolean DEFAULT false,
  unlocked_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_achievement_progress ENABLE ROW LEVEL SECURITY;

-- ── Legacy World Artifacts (collectibles) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_world_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  artifact_id uuid REFERENCES family_artifacts(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  artifact_type text DEFAULT 'heirloom',
  source text,
  date_origin text,
  location text,
  story text,
  unlocked_by text,
  is_unlocked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_world_artifacts ENABLE ROW LEVEL SECURITY;

-- ── Family Knowledge Versions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_knowledge_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  version_number int NOT NULL,
  knowledge_hash text NOT NULL,
  member_count int DEFAULT 0,
  memory_count int DEFAULT 0,
  interview_count int DEFAULT 0,
  place_count int DEFAULT 0,
  event_count int DEFAULT 0,
  artifact_count int DEFAULT 0,
  change_description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE family_knowledge_versions ENABLE ROW LEVEL SECURITY;

-- ── Legacy World Versions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_world_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  knowledge_version_id uuid REFERENCES family_knowledge_versions(id) ON DELETE SET NULL,
  version_label text,
  changes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE legacy_world_versions ENABLE ROW LEVEL SECURITY;

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_family_members_family_id ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_memories_family_id ON family_memories(family_id);
CREATE INDEX IF NOT EXISTS idx_family_places_family_id ON family_places(family_id);
CREATE INDEX IF NOT EXISTS idx_family_events_family_id ON family_events(family_id);
CREATE INDEX IF NOT EXISTS idx_family_interviews_family_id ON family_interviews(family_id);
CREATE INDEX IF NOT EXISTS idx_family_artifacts_family_id ON family_artifacts(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_worlds_family_id ON legacy_worlds(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_chapters_world_id ON legacy_chapters(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_scenes_chapter_id ON legacy_scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_legacy_dialogues_scene_id ON legacy_dialogues(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_choices_scene_id ON legacy_choices(scene_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_world_id ON legacy_sessions(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_quests_world_id ON legacy_quests(world_id);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_versions_family_id ON family_knowledge_versions(family_id);

-- ── Seed: Default Achievements ───────────────────────────────────────────────

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
