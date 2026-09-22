-- Migration 0020: Core foreign key constraints
-- Adds FK constraints on the highest-traffic join pairs that currently have none.
-- Every block is idempotent (checks pg_constraint before altering) and cleans
-- orphaned rows first so the constraint addition never fails on existing data.
--
-- Tables covered:
--   help_requests.requester_id   → users(id) ON DELETE CASCADE
--   help_requests.helper_id      → users(id) ON DELETE SET NULL
--   chat_messages.request_id     → help_requests(id) ON DELETE CASCADE
--   chat_messages.sender_id      → users(id) ON DELETE CASCADE
--   transactions.user_id         → users(id) ON DELETE CASCADE
--   ratings.request_id           → help_requests(id) ON DELETE CASCADE
--   ratings.rater_id             → users(id) ON DELETE CASCADE
--   ratings.ratee_id             → users(id) ON DELETE CASCADE
--
-- Why now: The delete-account endpoint (DELETE /users/:id) manually cascades
-- through related tables in application code. With these FKs the DB enforces
-- referential integrity as a backstop — any missed table in app code won't
-- leave orphaned rows.

-- 1. help_requests.requester_id → users(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'help_requests_requester_id_fk'
      AND conrelid = 'help_requests'::regclass
  ) THEN
    -- Clean orphans first (requester user deleted without cascading)
    DELETE FROM help_requests
      WHERE requester_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = help_requests.requester_id);
    ALTER TABLE help_requests
      ADD CONSTRAINT help_requests_requester_id_fk
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added help_requests_requester_id_fk';
  ELSE
    RAISE NOTICE 'help_requests_requester_id_fk already exists — skipped';
  END IF;
END $$;

-- 2. help_requests.helper_id → users(id) ON DELETE SET NULL
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'help_requests_helper_id_fk'
      AND conrelid = 'help_requests'::regclass
  ) THEN
    UPDATE help_requests
      SET helper_id = NULL
      WHERE helper_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = help_requests.helper_id);
    ALTER TABLE help_requests
      ADD CONSTRAINT help_requests_helper_id_fk
      FOREIGN KEY (helper_id) REFERENCES users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added help_requests_helper_id_fk';
  ELSE
    RAISE NOTICE 'help_requests_helper_id_fk already exists — skipped';
  END IF;
END $$;

-- 3. chat_messages.request_id → help_requests(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_request_id_fk'
      AND conrelid = 'chat_messages'::regclass
  ) THEN
    DELETE FROM chat_messages
      WHERE NOT EXISTS (
        SELECT 1 FROM help_requests r WHERE r.id = chat_messages.request_id
      );
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_request_id_fk
      FOREIGN KEY (request_id) REFERENCES help_requests(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added chat_messages_request_id_fk';
  ELSE
    RAISE NOTICE 'chat_messages_request_id_fk already exists — skipped';
  END IF;
END $$;

-- 4. chat_messages.sender_id → users(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chat_messages_sender_id_fk'
      AND conrelid = 'chat_messages'::regclass
  ) THEN
    DELETE FROM chat_messages
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = chat_messages.sender_id);
    ALTER TABLE chat_messages
      ADD CONSTRAINT chat_messages_sender_id_fk
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added chat_messages_sender_id_fk';
  ELSE
    RAISE NOTICE 'chat_messages_sender_id_fk already exists — skipped';
  END IF;
END $$;

-- 5. transactions.user_id → users(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_user_id_fk'
      AND conrelid = 'transactions'::regclass
  ) THEN
    DELETE FROM transactions
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = transactions.user_id);
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added transactions_user_id_fk';
  ELSE
    RAISE NOTICE 'transactions_user_id_fk already exists — skipped';
  END IF;
END $$;

-- 6. ratings.request_id → help_requests(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ratings_request_id_fk'
      AND conrelid = 'ratings'::regclass
  ) THEN
    DELETE FROM ratings
      WHERE NOT EXISTS (
        SELECT 1 FROM help_requests r WHERE r.id = ratings.request_id
      );
    ALTER TABLE ratings
      ADD CONSTRAINT ratings_request_id_fk
      FOREIGN KEY (request_id) REFERENCES help_requests(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added ratings_request_id_fk';
  ELSE
    RAISE NOTICE 'ratings_request_id_fk already exists — skipped';
  END IF;
END $$;

-- 7. ratings.rater_id → users(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ratings_rater_id_fk'
      AND conrelid = 'ratings'::regclass
  ) THEN
    DELETE FROM ratings
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ratings.rater_id);
    ALTER TABLE ratings
      ADD CONSTRAINT ratings_rater_id_fk
      FOREIGN KEY (rater_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added ratings_rater_id_fk';
  ELSE
    RAISE NOTICE 'ratings_rater_id_fk already exists — skipped';
  END IF;
END $$;

-- 8. ratings.ratee_id → users(id) ON DELETE CASCADE
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ratings_ratee_id_fk'
      AND conrelid = 'ratings'::regclass
  ) THEN
    DELETE FROM ratings
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ratings.ratee_id);
    ALTER TABLE ratings
      ADD CONSTRAINT ratings_ratee_id_fk
      FOREIGN KEY (ratee_id) REFERENCES users(id) ON DELETE CASCADE;
    RAISE NOTICE 'Added ratings_ratee_id_fk';
  ELSE
    RAISE NOTICE 'ratings_ratee_id_fk already exists — skipped';
  END IF;
END $$;
