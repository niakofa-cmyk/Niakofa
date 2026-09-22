DO $$
BEGIN
  CREATE TYPE circle_recording_status AS ENUM (
    'RECORDING_REQUESTED',
    'RECORDING_AUTHORIZED',
    'RECORDING_ACTIVE',
    'RECORDING_FINALIZING',
    'RECORDING_ARCHIVED',
    'RECORDING_FAILED',
    'RECORDING_DELETED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS circle_recordings (
  id serial PRIMARY KEY,
  session_id integer NOT NULL REFERENCES audio_circle_sessions(id) ON DELETE CASCADE,
  circle_id integer NOT NULL REFERENCES audio_circles(id) ON DELETE CASCADE,
  host_id integer REFERENCES users(id) ON DELETE SET NULL,
  status circle_recording_status NOT NULL DEFAULT 'RECORDING_REQUESTED',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  mime_type varchar(100),
  byte_size bigint,
  storage_key text,
  checksum_sha256 varchar(64),
  retention_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS circle_recordings_session_idx ON circle_recordings(session_id);
CREATE INDEX IF NOT EXISTS circle_recordings_retention_idx ON circle_recordings(retention_until);
CREATE INDEX IF NOT EXISTS circle_recordings_status_idx ON circle_recordings(status);

CREATE TABLE IF NOT EXISTS circle_recording_consent (
  id serial PRIMARY KEY,
  recording_id integer NOT NULL REFERENCES circle_recordings(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS circle_recording_consent_recording_user_uidx
  ON circle_recording_consent(recording_id, user_id);
CREATE INDEX IF NOT EXISTS circle_recording_consent_recording_idx
  ON circle_recording_consent(recording_id);

ALTER TABLE audio_circle_sessions
  ALTER COLUMN recording_allowed SET DEFAULT false;