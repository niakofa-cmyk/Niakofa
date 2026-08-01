-- 0098_legacy_phase5_living_universe.sql
--
-- Phase 5 — Living Family Universe
-- Cooperative family missions, shared seasonal events, dynamic AI Game
-- Master, and world-evolution tracking.
--
-- Tables: legacy_seasonal_events, legacy_seasonal_event_participations,
--         legacy_game_master_narrations, legacy_world_evolution_log
-- Enums:  legacy_event_type, legacy_trigger_type, legacy_event_status,
--         legacy_narration_type, legacy_change_type
-- Triggers: update_updated_at (seasonal events),
--           check_seasonal_event_complete (auto-complete on goal met)

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE legacy_event_type AS ENUM (
    'anniversary', 'reunion', 'cultural_holiday', 'birthday',
    'migration_anniversary', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_trigger_type AS ENUM (
    'fixed_date', 'recurring_annual', 'recurring_monthly', 'knowledge_change'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_event_status AS ENUM (
    'pending', 'active', 'completed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_narration_type AS ENUM (
    'scene_intro', 'dialogue', 'quest_prompt',
    'chapter_summary', 'historical_context', 'ancestor_introduction'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_change_type AS ENUM (
    'member_added', 'memory_added', 'story_added',
    'interview_added', 'place_added', 'event_added',
    'relation_added', 'world_regenerated'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── legacy_seasonal_events ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_seasonal_events (
  id                serial PRIMARY KEY,
  family_id         integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  event_type        legacy_event_type NOT NULL DEFAULT 'custom',
  title             text NOT NULL,
  description       text,
  trigger_type      legacy_trigger_type NOT NULL DEFAULT 'recurring_annual',
  trigger_date      date,
  target_member_id  integer REFERENCES family_members(id) ON DELETE SET NULL,
  goal              integer NOT NULL DEFAULT 5,
  reward_title      text,
  reward_description text,
  status            legacy_event_status NOT NULL DEFAULT 'pending',
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_legacy_seasonal_events_family
  ON legacy_seasonal_events(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_seasonal_events_status
  ON legacy_seasonal_events(family_id, status);
CREATE INDEX IF NOT EXISTS idx_legacy_seasonal_events_trigger
  ON legacy_seasonal_events(family_id, trigger_type);

-- ── legacy_seasonal_event_participations ────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_seasonal_event_participations (
  id                serial PRIMARY KEY,
  event_id           integer NOT NULL REFERENCES legacy_seasonal_events(id) ON DELETE CASCADE,
  member_id          integer REFERENCES family_members(id) ON DELETE SET NULL,
  user_id            integer,
  contribution_type  text NOT NULL,
  contribution_note  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_seasonal_event_participations_event
  ON legacy_seasonal_event_participations(event_id);
CREATE INDEX IF NOT EXISTS idx_legacy_seasonal_event_participations_member
  ON legacy_seasonal_event_participations(member_id);

-- ── legacy_game_master_narrations ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_game_master_narrations (
  id              serial PRIMARY KEY,
  family_id       integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  session_id      integer REFERENCES legacy_sessions(id) ON DELETE CASCADE,
  chapter_id      integer REFERENCES legacy_chapters(id) ON DELETE CASCADE,
  narration_type  legacy_narration_type NOT NULL,
  content         text NOT NULL,
  content_metadata jsonb DEFAULT '{}'::jsonb,
  model_used      text,
  prompt_hash     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_game_master_narrations_family
  ON legacy_game_master_narrations(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_game_master_narrations_session
  ON legacy_game_master_narrations(session_id);
CREATE INDEX IF NOT EXISTS idx_legacy_game_master_narrations_chapter
  ON legacy_game_master_narrations(chapter_id);
CREATE INDEX IF NOT EXISTS idx_legacy_game_master_narrations_hash
  ON legacy_game_master_narrations(family_id, prompt_hash);

-- ── legacy_world_evolution_log ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_world_evolution_log (
  id                  serial PRIMARY KEY,
  family_id           integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  knowledge_version_id integer REFERENCES family_knowledge_versions(id) ON DELETE SET NULL,
  change_type         legacy_change_type NOT NULL,
  change_description  text,
  affected_count      integer NOT NULL DEFAULT 1,
  previous_version    integer,
  new_version         integer,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_world_evolution_log_family
  ON legacy_world_evolution_log(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_world_evolution_log_type
  ON legacy_world_evolution_log(family_id, change_type);
CREATE INDEX IF NOT EXISTS idx_legacy_world_evolution_log_created
  ON legacy_world_evolution_log(family_id, created_at DESC);

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_legacy_seasonal_events_updated_at
  ON legacy_seasonal_events;
CREATE TRIGGER trigger_legacy_seasonal_events_updated_at
  BEFORE UPDATE ON legacy_seasonal_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION check_seasonal_event_complete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE legacy_seasonal_events
  SET status = 'completed',
      completed_at = now()
  WHERE id = NEW.event_id
    AND status = 'active'
    AND (
      SELECT count(*) FROM legacy_seasonal_event_participations
      WHERE event_id = NEW.event_id
    ) >= (
      SELECT goal FROM legacy_seasonal_events WHERE id = NEW.event_id
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_seasonal_event_participation_complete
  ON legacy_seasonal_event_participations;
CREATE TRIGGER trigger_seasonal_event_participation_complete
  AFTER INSERT ON legacy_seasonal_event_participations
  FOR EACH ROW EXECUTE FUNCTION check_seasonal_event_complete();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE legacy_seasonal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_seasonal_event_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_game_master_narrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_world_evolution_log ENABLE ROW LEVEL SECURITY;
