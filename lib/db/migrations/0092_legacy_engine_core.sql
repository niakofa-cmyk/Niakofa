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

-- ── Family Places ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  label text NOT NULL,
  country text,
  region text,
  lat double precision,
  lng double precision,
  historical_context text,
  linked_members uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── Family Events ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  event_year text,
  event_type text DEFAULT 'life_event',
  linked_members uuid[] DEFAULT '{}',
  linked_places uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── Family Interviews ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_interviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  subject_name text NOT NULL,
  interviewer_name text,
  transcript text,
  audio_url text,
  video_url text,
  duration_seconds int,
  interview_year text,
  themes text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- ── Family Artifacts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  artifact_type text DEFAULT 'object',
  media_url text,
  date_origin text,
  location text,
  story text,
  linked_members uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

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
  ancestor_focus uuid REFERENCES family_members(id) ON DELETE SET NULL,
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
  evidence_link uuid REFERENCES family_memories(id) ON DELETE SET NULL,
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
