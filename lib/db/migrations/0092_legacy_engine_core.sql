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

DROP POLICY IF EXISTS "anon_select_family_members" ON family_members;
CREATE POLICY "anon_select_family_members" ON family_members FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_members" ON family_members;
CREATE POLICY "anon_insert_family_members" ON family_members FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_members" ON family_members;
CREATE POLICY "anon_update_family_members" ON family_members FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_members" ON family_members;
CREATE POLICY "anon_delete_family_members" ON family_members FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_family_memories" ON family_memories;
CREATE POLICY "anon_select_family_memories" ON family_memories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_memories" ON family_memories;
CREATE POLICY "anon_insert_family_memories" ON family_memories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_memories" ON family_memories;
CREATE POLICY "anon_update_family_memories" ON family_memories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_memories" ON family_memories;
CREATE POLICY "anon_delete_family_memories" ON family_memories FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_family_places" ON family_places;
CREATE POLICY "anon_select_family_places" ON family_places FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_places" ON family_places;
CREATE POLICY "anon_insert_family_places" ON family_places FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_places" ON family_places;
CREATE POLICY "anon_update_family_places" ON family_places FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_places" ON family_places;
CREATE POLICY "anon_delete_family_places" ON family_places FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_family_events" ON family_events;
CREATE POLICY "anon_select_family_events" ON family_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_events" ON family_events;
CREATE POLICY "anon_insert_family_events" ON family_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_events" ON family_events;
CREATE POLICY "anon_update_family_events" ON family_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_events" ON family_events;
CREATE POLICY "anon_delete_family_events" ON family_events FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_family_interviews" ON family_interviews;
CREATE POLICY "anon_select_family_interviews" ON family_interviews FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_interviews" ON family_interviews;
CREATE POLICY "anon_insert_family_interviews" ON family_interviews FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_interviews" ON family_interviews;
CREATE POLICY "anon_update_family_interviews" ON family_interviews FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_interviews" ON family_interviews;
CREATE POLICY "anon_delete_family_interviews" ON family_interviews FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_family_artifacts" ON family_artifacts;
CREATE POLICY "anon_select_family_artifacts" ON family_artifacts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_artifacts" ON family_artifacts;
CREATE POLICY "anon_insert_family_artifacts" ON family_artifacts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_artifacts" ON family_artifacts;
CREATE POLICY "anon_update_family_artifacts" ON family_artifacts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_artifacts" ON family_artifacts;
CREATE POLICY "anon_delete_family_artifacts" ON family_artifacts FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_worlds" ON legacy_worlds;
CREATE POLICY "anon_select_legacy_worlds" ON legacy_worlds FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_worlds" ON legacy_worlds;
CREATE POLICY "anon_insert_legacy_worlds" ON legacy_worlds FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_worlds" ON legacy_worlds;
CREATE POLICY "anon_update_legacy_worlds" ON legacy_worlds FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_worlds" ON legacy_worlds;
CREATE POLICY "anon_delete_legacy_worlds" ON legacy_worlds FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_chapters" ON legacy_chapters;
CREATE POLICY "anon_select_legacy_chapters" ON legacy_chapters FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_chapters" ON legacy_chapters;
CREATE POLICY "anon_insert_legacy_chapters" ON legacy_chapters FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_chapters" ON legacy_chapters;
CREATE POLICY "anon_update_legacy_chapters" ON legacy_chapters FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_chapters" ON legacy_chapters;
CREATE POLICY "anon_delete_legacy_chapters" ON legacy_chapters FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_scenes" ON legacy_scenes;
CREATE POLICY "anon_select_legacy_scenes" ON legacy_scenes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_scenes" ON legacy_scenes;
CREATE POLICY "anon_insert_legacy_scenes" ON legacy_scenes FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_scenes" ON legacy_scenes;
CREATE POLICY "anon_update_legacy_scenes" ON legacy_scenes FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_scenes" ON legacy_scenes;
CREATE POLICY "anon_delete_legacy_scenes" ON legacy_scenes FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_select_legacy_dialogues" ON legacy_dialogues FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_insert_legacy_dialogues" ON legacy_dialogues FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_update_legacy_dialogues" ON legacy_dialogues FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_dialogues" ON legacy_dialogues;
CREATE POLICY "anon_delete_legacy_dialogues" ON legacy_dialogues FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_choices" ON legacy_choices;
CREATE POLICY "anon_select_legacy_choices" ON legacy_choices FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_choices" ON legacy_choices;
CREATE POLICY "anon_insert_legacy_choices" ON legacy_choices FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_choices" ON legacy_choices;
CREATE POLICY "anon_update_legacy_choices" ON legacy_choices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_choices" ON legacy_choices;
CREATE POLICY "anon_delete_legacy_choices" ON legacy_choices FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_sessions" ON legacy_sessions;
CREATE POLICY "anon_select_legacy_sessions" ON legacy_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_sessions" ON legacy_sessions;
CREATE POLICY "anon_insert_legacy_sessions" ON legacy_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_sessions" ON legacy_sessions;
CREATE POLICY "anon_update_legacy_sessions" ON legacy_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_sessions" ON legacy_sessions;
CREATE POLICY "anon_delete_legacy_sessions" ON legacy_sessions FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_quests" ON legacy_quests;
CREATE POLICY "anon_select_legacy_quests" ON legacy_quests FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_quests" ON legacy_quests;
CREATE POLICY "anon_insert_legacy_quests" ON legacy_quests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_quests" ON legacy_quests;
CREATE POLICY "anon_update_legacy_quests" ON legacy_quests FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_quests" ON legacy_quests;
CREATE POLICY "anon_delete_legacy_quests" ON legacy_quests FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_quest_progress" ON legacy_quest_progress;
CREATE POLICY "anon_select_legacy_quest_progress" ON legacy_quest_progress FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_quest_progress" ON legacy_quest_progress;
CREATE POLICY "anon_insert_legacy_quest_progress" ON legacy_quest_progress FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_quest_progress" ON legacy_quest_progress;
CREATE POLICY "anon_update_legacy_quest_progress" ON legacy_quest_progress FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_quest_progress" ON legacy_quest_progress;
CREATE POLICY "anon_delete_legacy_quest_progress" ON legacy_quest_progress FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_achievements" ON legacy_achievements;
CREATE POLICY "anon_select_legacy_achievements" ON legacy_achievements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_achievements" ON legacy_achievements;
CREATE POLICY "anon_insert_legacy_achievements" ON legacy_achievements FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_achievements" ON legacy_achievements;
CREATE POLICY "anon_update_legacy_achievements" ON legacy_achievements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_achievements" ON legacy_achievements;
CREATE POLICY "anon_delete_legacy_achievements" ON legacy_achievements FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_achievement_progress" ON legacy_achievement_progress;
CREATE POLICY "anon_select_legacy_achievement_progress" ON legacy_achievement_progress FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_achievement_progress" ON legacy_achievement_progress;
CREATE POLICY "anon_insert_legacy_achievement_progress" ON legacy_achievement_progress FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_achievement_progress" ON legacy_achievement_progress;
CREATE POLICY "anon_update_legacy_achievement_progress" ON legacy_achievement_progress FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_achievement_progress" ON legacy_achievement_progress;
CREATE POLICY "anon_delete_legacy_achievement_progress" ON legacy_achievement_progress FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_world_artifacts" ON legacy_world_artifacts;
CREATE POLICY "anon_select_legacy_world_artifacts" ON legacy_world_artifacts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_world_artifacts" ON legacy_world_artifacts;
CREATE POLICY "anon_insert_legacy_world_artifacts" ON legacy_world_artifacts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_world_artifacts" ON legacy_world_artifacts;
CREATE POLICY "anon_update_legacy_world_artifacts" ON legacy_world_artifacts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_world_artifacts" ON legacy_world_artifacts;
CREATE POLICY "anon_delete_legacy_world_artifacts" ON legacy_world_artifacts FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_family_knowledge_versions" ON family_knowledge_versions;
CREATE POLICY "anon_select_family_knowledge_versions" ON family_knowledge_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_family_knowledge_versions" ON family_knowledge_versions;
CREATE POLICY "anon_insert_family_knowledge_versions" ON family_knowledge_versions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_family_knowledge_versions" ON family_knowledge_versions;
CREATE POLICY "anon_update_family_knowledge_versions" ON family_knowledge_versions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_family_knowledge_versions" ON family_knowledge_versions;
CREATE POLICY "anon_delete_family_knowledge_versions" ON family_knowledge_versions FOR DELETE
  TO anon, authenticated USING (true);

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

DROP POLICY IF EXISTS "anon_select_legacy_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_select_legacy_world_versions" ON legacy_world_versions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_legacy_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_insert_legacy_world_versions" ON legacy_world_versions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_legacy_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_update_legacy_world_versions" ON legacy_world_versions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_legacy_world_versions" ON legacy_world_versions;
CREATE POLICY "anon_delete_legacy_world_versions" ON legacy_world_versions FOR DELETE
  TO anon, authenticated USING (true);

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

-- ── Seed: Sample Family Data ─────────────────────────────────────────────────

INSERT INTO family_members (display_name, role, birth_year, birth_place, generation, bio, storytelling_consent)
VALUES
  ('Ama Serwaa', 'Ancestor', '1898', 'Cape Coast, Ghana', 1, 'Ama loved school, but her father expected her to help with the family business. She was known for her sharp memory and kindness.', true),
  ('Kofi Mensah', 'Ancestor', '1890', 'Kumasi, Ghana', 1, 'Kofi was a trader who traveled between Cape Coast and Kumasi. He spoke three languages.', true),
  ('Adwoa Serwaa', 'Elder', '1925', 'Cape Coast, Ghana', 2, 'Adwoa was Ama''s daughter. She became a teacher at the mission school.', true),
  ('Kwame Mensah', 'Elder', '1928', 'Accra, Ghana', 2, 'Kwame moved to Accra in 1948 to work in the new government offices.', true),
  ('Mary Johnson', 'Elder', '1932', 'Detroit, USA', 3, 'Mary migrated to Detroit in 1957. She worked at Ford and was active in her church choir.', true)
ON CONFLICT DO NOTHING;

INSERT INTO family_places (label, country, region, historical_context)
VALUES
  ('Cape Coast', 'Ghana', 'Central Region', 'A major colonial trading port with a historic castle and mission schools.'),
  ('Kumasi', 'Ghana', 'Ashanti Region', 'The capital of the Ashanti Kingdom, known for its craft traditions and central market.'),
  ('Accra', 'Ghana', 'Greater Accra', 'The colonial capital, site of the 1948 riots and growing independence movement.'),
  ('Detroit', 'USA', 'Michigan', 'A major industrial city that drew African American workers during the Great Migration.')
ON CONFLICT DO NOTHING;

INSERT INTO family_events (title, description, event_year, event_type)
VALUES
  ('Birth of Ama Serwaa', 'Ama was born in Cape Coast to a Fante family.', '1898', 'birth'),
  ('Ama starts school', 'Ama attended the mission school, one of few girls allowed.', '1908', 'education'),
  ('Family business grows', 'Kofi expanded his trading routes to include Kumasi.', '1912', 'business'),
  ('Adwoa becomes a teacher', 'Adwoa returned to Cape Coast to teach at the mission school.', '1945', 'career'),
  ('Kwame moves to Accra', 'Kwame relocated for a government position after the 1948 riots.', '1948', 'migration'),
  ('Mary migrates to Detroit', 'Mary moved north for factory work during the Great Migration.', '1957', 'migration')
ON CONFLICT DO NOTHING;

INSERT INTO family_memories (title, description, memory_type, tags)
VALUES
  ('Ama''s morning routine', 'Grandmother said Ama woke before sunrise to help her mother prepare breakfast before school.', 'story', '{childhood, school, daily life}'),
  ('The market days', 'Kofi would leave at dawn for the market, returning with cloth and spices from the interior.', 'story', '{trade, kumasi, cape coast}'),
  ('Adwoa''s first class', 'Adwoa taught her first class of twelve children, all barefoot but eager to learn.', 'story', '{teaching, mission school}'),
  ('The Detroit church', 'Mary sang in the choir at Second Baptist, the oldest Black church in Detroit.', 'story', '{detroit, church, music}'),
  ('The family Bible', 'The old Bible was brought from Cape Coast and carried through three migrations.', 'story', '{heirloom, faith, migration}')
ON CONFLICT DO NOTHING;

INSERT INTO family_artifacts (name, description, artifact_type, date_origin, location, story)
VALUES
  ('Family Bible', 'A worn leather Bible with births and deaths recorded inside.', 'heirloom', '1898', 'Cape Coast', 'Brought from Cape Coast, carried through migrations to Accra and then to Detroit.'),
  ('Old Letter', 'A letter from Kofi to Ama, written in 1910.', 'document', '1910', 'Kumasi', 'Kofi wrote to Ama about his travels and the goods he found in Kumasi.'),
  ('Ancestral Necklace', 'Gold beads worn by Ama at her coming-of-age ceremony.', 'heirloom', '1912', 'Cape Coast', 'The necklace was passed from Ama to Adwoa and then to Mary.'),
  ('Mission School Book', 'A primer used by Adwoa at the mission school.', 'document', '1935', 'Cape Coast', 'Adwoa kept this book her entire teaching career.')
ON CONFLICT DO NOTHING;
