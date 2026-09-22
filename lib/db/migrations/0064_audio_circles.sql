-- Migration 0064: Niakofa Audio Circles
--
-- Adds:
--   1. audio_circles              — one live-voice channel per neighborhood
--                                   (city_neighborhoods row), plus one
--                                   city-wide circle per city_key.
--   2. audio_circle_sessions      — individual live broadcasts inside a circle.
--   3. audio_circle_participants  — who's in a session and their role.
--
-- Also seeds Fort Worth's 9 neighborhoods into city_neighborhoods as
-- source='curated', verified=true — that table already existed (migration
-- 0003) and community-neighborhoods.ts's own comments describe Fort Worth's
-- rows as "hand-written... seeded by migration", but no migration ever
-- actually did that seeding; the only place Fort Worth's neighborhoods
-- existed was a hardcoded array in community.tsx, invisible to this more
-- general system and to any other city. This migration makes that comment
-- true and gives Audio Circles real seed data to attach to.
--
-- Idempotent — safe to re-run (see CLAUDE.md Incident #2).

CREATE TABLE IF NOT EXISTS audio_circles (
  id              SERIAL PRIMARY KEY,
  city_key        TEXT NOT NULL,
  city_display    TEXT NOT NULL,
  neighborhood_id INTEGER REFERENCES city_neighborhoods(id) ON DELETE CASCADE,
  community_id    INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audio_circles_city_key_idx ON audio_circles (city_key);
CREATE INDEX IF NOT EXISTS audio_circles_neighborhood_idx ON audio_circles (neighborhood_id);

CREATE TABLE IF NOT EXISTS audio_circle_sessions (
  id            SERIAL PRIMARY KEY,
  circle_id     INTEGER NOT NULL REFERENCES audio_circles(id) ON DELETE CASCADE,
  host_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'live',
  video_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_recording  BOOLEAN NOT NULL DEFAULT FALSE,
  recording_url TEXT,
  max_speakers  INTEGER NOT NULL DEFAULT 13,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audio_circle_sessions_circle_idx ON audio_circle_sessions (circle_id);
CREATE INDEX IF NOT EXISTS audio_circle_sessions_status_idx ON audio_circle_sessions (status);
CREATE INDEX IF NOT EXISTS audio_circle_sessions_host_idx ON audio_circle_sessions (host_id);

CREATE TABLE IF NOT EXISTS audio_circle_participants (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES audio_circle_sessions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'listener',
  hand_raised BOOLEAN NOT NULL DEFAULT FALSE,
  muted       BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS audio_circle_participants_session_idx ON audio_circle_participants (session_id);
CREATE INDEX IF NOT EXISTS audio_circle_participants_user_idx ON audio_circle_participants (user_id);

-- ─── Seed: Fort Worth's 9 neighborhoods (formerly hardcoded in
-- community.tsx, invisible to this table and to every other city) as
-- curated, verified rows — then one Audio Circle per neighborhood, plus one
-- city-wide circle.
INSERT INTO city_neighborhoods (city_key, city_display, neighborhood_id, name, emoji, description, source, verified)
VALUES
  ('fort_worth', 'Fort Worth', 'southside',        'Southside',          '🏘️', 'Historic community south of downtown',            'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'near_southside',   'Near Southside',     '🌳', 'Creative district near Magnolia Ave',              'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'polytechnic',      'Polytechnic',        '🎓', 'Home of Texas Wesleyan University',                'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'riverside',        'Riverside',          '🌊', 'Diverse neighborhood along the Trinity River',     'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'downtown',         'Downtown',           '🏙️', 'Urban core of Fort Worth',                         'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'east_fort_worth',  'East Fort Worth',    '🌅', 'Working-class roots and tight-knit community',     'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'north_fort_worth', 'North Fort Worth',   '🤠', 'Stockyards district and growing suburbs',          'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'stop_six',         'Stop Six',           '✊', 'Resilient community with deep history',            'curated', TRUE),
  ('fort_worth', 'Fort Worth', 'wedgwood',         'Wedgwood',           '🏡', 'Family-friendly neighborhood in southwest FW',     'curated', TRUE)
ON CONFLICT (city_key, neighborhood_id) DO NOTHING;

-- One circle per Fort Worth neighborhood.
INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
SELECT cn.city_key, cn.city_display, cn.id, cn.name || ' Circle'
FROM city_neighborhoods cn
WHERE cn.city_key = 'fort_worth'
  AND NOT EXISTS (
    SELECT 1 FROM audio_circles ac WHERE ac.neighborhood_id = cn.id
  );

-- One city-wide circle for Fort Worth (neighborhood_id IS NULL).
INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
SELECT 'fort_worth', 'Fort Worth', NULL, 'Fort Worth Circle'
WHERE NOT EXISTS (
  SELECT 1 FROM audio_circles ac WHERE ac.city_key = 'fort_worth' AND ac.neighborhood_id IS NULL
);

-- Best-effort link to the matching communities row (Tarrant County), where one exists.
UPDATE audio_circles
SET community_id = (SELECT id FROM communities WHERE name = 'Tarrant County' LIMIT 1)
WHERE city_key = 'fort_worth' AND community_id IS NULL;
