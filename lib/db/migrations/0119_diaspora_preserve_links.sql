-- Migration 0119: Diaspora Preserve-the-Culture durable QR links
--
-- Keeps the raw QR payload out of the database. A scan stores only a SHA-256
-- digest plus the resolved card/type. The row becomes a durable memory link
-- when POST /api/diaspora/preserve/links/:id supplies the selected memory.

CREATE TABLE IF NOT EXISTS diaspora_preserve_links (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   INTEGER REFERENCES families(id) ON DELETE CASCADE,
  memory_id   INTEGER REFERENCES family_memories(id) ON DELETE CASCADE,
  qr_digest   TEXT NOT NULL,
  card_id     TEXT,
  resolved_type TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_diaspora_preserve_links_user
  ON diaspora_preserve_links(user_id);
CREATE INDEX IF NOT EXISTS idx_diaspora_preserve_links_family
  ON diaspora_preserve_links(family_id);
CREATE INDEX IF NOT EXISTS idx_diaspora_preserve_links_memory
  ON diaspora_preserve_links(memory_id);
CREATE UNIQUE INDEX IF NOT EXISTS diaspora_preserve_links_user_memory_unique
  ON diaspora_preserve_links(user_id, memory_id)
  WHERE memory_id IS NOT NULL;
