-- Migration 0011: Forensic schema hardening
-- Adds missing foreign keys, a status check constraint, a missing index, and
-- aligns timestamp columns with the Drizzle schema (timestamptz). Every block
-- is idempotent (IF NOT EXISTS / conditional type check) so it is safe to run
-- against an already-provisioned database.

-- 1. gratitude_likes.post_id → gratitude_posts(id) ON DELETE CASCADE
--    Prevents orphaned likes and likes for non-existent posts.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'gratitude_likes_post_id_fk'
      AND conrelid = 'gratitude_likes'::regclass
  ) THEN
    DELETE FROM gratitude_likes l
      WHERE NOT EXISTS (SELECT 1 FROM gratitude_posts p WHERE p.id = l.post_id);
    ALTER TABLE gratitude_likes
      ADD CONSTRAINT gratitude_likes_post_id_fk
      FOREIGN KEY (post_id) REFERENCES gratitude_posts(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. reports.reported_request_id → help_requests(id) ON DELETE SET NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_reported_request_id_fk'
      AND conrelid = 'reports'::regclass
  ) THEN
    UPDATE reports r SET reported_request_id = NULL
      WHERE reported_request_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM help_requests h WHERE h.id = r.reported_request_id);
    ALTER TABLE reports
      ADD CONSTRAINT reports_reported_request_id_fk
      FOREIGN KEY (reported_request_id) REFERENCES help_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. reports.reviewed_by → users(id) ON DELETE SET NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_reviewed_by_fk'
      AND conrelid = 'reports'::regclass
  ) THEN
    UPDATE reports r SET reviewed_by = NULL
      WHERE reviewed_by IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = r.reviewed_by);
    ALTER TABLE reports
      ADD CONSTRAINT reports_reviewed_by_fk
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. civic_suggestions.status: constrain to known values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'civic_suggestions_status_values'
      AND conrelid = 'civic_suggestions'::regclass
  ) THEN
    UPDATE civic_suggestions
      SET status = 'pending'
      WHERE status NOT IN ('pending', 'approved', 'dismissed');
    ALTER TABLE civic_suggestions
      ADD CONSTRAINT civic_suggestions_status_values
      CHECK (status IN ('pending', 'approved', 'dismissed'));
  END IF;
END $$;

-- 5. nia_conversations.user_id index (history lookups by user)
CREATE INDEX IF NOT EXISTS nia_conversations_user_id_idx
  ON nia_conversations (user_id);

-- 6. Align timestamp columns with the Drizzle schema (timestamptz).
--    Each column is only converted if it is still tz-naive. Existing values are
--    reinterpreted as UTC (pg's storage default) before the cast.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('reports', 'reviewed_at'),
      ('reports', 'created_at'),
      ('reports', 'updated_at'),
      ('civic_suggestions', 'created_at'),
      ('civic_suggestions', 'reviewed_at'),
      ('password_reset_codes', 'expires_at'),
      ('password_reset_codes', 'used_at'),
      ('password_reset_codes', 'created_at'),
      ('gratitude_likes', 'created_at')
    ) AS t(tbl, col)
  LOOP
    IF (
      SELECT data_type FROM information_schema.columns
      WHERE table_name = rec.tbl AND column_name = rec.col
        AND table_schema = current_schema()
    ) = 'timestamp without time zone' THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
        rec.tbl, rec.col, rec.col
      );
    END IF;
  END LOOP;
END $$;
