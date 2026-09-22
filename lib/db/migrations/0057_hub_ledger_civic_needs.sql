-- Migration 0057: Hub pledge ring-fencing + Civic needs/invoices pipeline
--
-- FIX 1: Per-hub pledge ring-fencing (promise-integrity)
--   community_pool_ledger grows a hub_id FK so pledges to Hub A are tagged to
--   that hub and can only be spent on requests also tagged to Hub A. A guard
--   in payHelperFromPool() excludes hub-reserved balance from the spendable
--   amount for requests not belonging to that hub.
--   diaspora_hubs grows target_reserve_amount + reserved_balance bookkeeping.
--   help_requests grows hub_id so requests can be tagged to a hub and spending
--   rules can be enforced.
--
-- FIX 2: Civic needs / invoices — two-way civic portal
--   civic_needs: county/gov-sponsor posts a need (title, description,
--     category, estimated_cost, due_date). Status: open → claimed → completed.
--   civic_invoices: generated when a claimed need is marked completed.
--     Status: pending → paid. (Stripe Connect for institutional payers
--     plugs in here; today admins mark-paid manually.)
--
-- Idempotent throughout (see CLAUDE.md Incident #2).

-- ── FIX 1: ring-fencing ───────────────────────────────────────────────────────

ALTER TABLE community_pool_ledger
  ADD COLUMN IF NOT EXISTS hub_id INTEGER REFERENCES diaspora_hubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pool_ledger_hub_id
  ON community_pool_ledger(hub_id)
  WHERE hub_id IS NOT NULL;

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS target_reserve_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_balance      NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS hub_id INTEGER REFERENCES diaspora_hubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_help_requests_hub_id
  ON help_requests(hub_id)
  WHERE hub_id IS NOT NULL;

-- ── FIX 2: civic needs & invoices ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS civic_needs (
  id                   SERIAL PRIMARY KEY,
  posted_by_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  government_sponsor_id INTEGER NOT NULL REFERENCES government_sponsors(id) ON DELETE CASCADE,
  title                TEXT    NOT NULL,
  description          TEXT,
  category             TEXT    NOT NULL DEFAULT 'other',
  estimated_cost       NUMERIC(12,2),
  due_date             DATE,
  status               TEXT    NOT NULL DEFAULT 'open',
  claimed_by_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  claimed_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civic_needs_status
  ON civic_needs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_civic_needs_sponsor
  ON civic_needs(government_sponsor_id);

CREATE TABLE IF NOT EXISTS civic_invoices (
  id              SERIAL PRIMARY KEY,
  civic_need_id   INTEGER NOT NULL REFERENCES civic_needs(id) ON DELETE CASCADE,
  amount          NUMERIC(12,2) NOT NULL,
  due_date        DATE    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending',
  paid_at         TIMESTAMPTZ,
  paid_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_civic_invoices_need_id
  ON civic_invoices(civic_need_id);

CREATE INDEX IF NOT EXISTS idx_civic_invoices_status
  ON civic_invoices(status);
