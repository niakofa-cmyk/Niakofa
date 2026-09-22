-- Migration 0054: Hub community leaders + cross-hub crisis relief
--
-- Adds the missing backend for the "hub leader" role and the "crisis-lit
-- hub with pledge" flow: diaspora hubs can now be flagged in crisis, get a
-- resident-elected/admin-approved leader who can manage the hub, and
-- receive direct pledges of help from other hubs. Broadcasts ride the
-- existing ws-hub "crisis_update" event type — no new socket plumbing.
--
-- Idempotent throughout (see CLAUDE.md Incident #2).

-- ── 1. Crisis fields on diaspora_hubs ───────────────────────────────────────
ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS is_crisis BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS crisis_message TEXT,
  ADD COLUMN IF NOT EXISTS crisis_declared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crisis_declared_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_is_crisis ON diaspora_hubs(is_crisis) WHERE is_crisis = TRUE;

-- ── 2. hub_community_leaders — resident-elected / admin-approved hub leads ──
-- A "manage_tasks" tier permission, not full platform admin (see
-- artifacts/api-server/src/routes/griot.ts comment above the old
-- admin-only /griot/hubs/:id/claim route). Any authenticated user (resident)
-- can apply; an existing approved leader OR a platform admin approves.
CREATE TABLE IF NOT EXISTS hub_community_leaders (
  id            SERIAL PRIMARY KEY,
  hub_id        INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'leader', -- leader | resident
  approved      BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hub_community_leaders_hub_user_unique UNIQUE (hub_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_leaders_hub ON hub_community_leaders(hub_id);
CREATE INDEX IF NOT EXISTS idx_hub_leaders_user ON hub_community_leaders(user_id);
CREATE INDEX IF NOT EXISTS idx_hub_leaders_approved ON hub_community_leaders(hub_id, approved) WHERE approved = TRUE;

-- ── 3. diaspora_hub_pledges — direct crisis help sent hub-to-hub ────────────
CREATE TABLE IF NOT EXISTS diaspora_hub_pledges (
  id            SERIAL PRIMARY KEY,
  from_hub_id   INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  to_hub_id     INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  pledged_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount        NUMERIC(10, 2) NOT NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pledged', -- pledged | fulfilled | cancelled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at  TIMESTAMPTZ,
  CONSTRAINT diaspora_hub_pledges_amount_positive CHECK (amount > 0),
  CONSTRAINT diaspora_hub_pledges_not_self CHECK (from_hub_id <> to_hub_id)
);

CREATE INDEX IF NOT EXISTS idx_hub_pledges_to_hub ON diaspora_hub_pledges(to_hub_id);
CREATE INDEX IF NOT EXISTS idx_hub_pledges_from_hub ON diaspora_hub_pledges(from_hub_id);
