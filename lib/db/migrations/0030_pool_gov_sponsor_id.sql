-- Migration 0030: link community_pool_ledger entries back to government_sponsors
-- Adds an optional government_sponsor_id FK so sponsor_contribution entries
-- can be traced to the government sponsor that funded the pool.
-- NULL means the contribution came from an individual/business donor, not a gov entity.

ALTER TABLE community_pool_ledger
  ADD COLUMN IF NOT EXISTS government_sponsor_id integer REFERENCES government_sponsors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pool_ledger_gov_sponsor_id_idx
  ON community_pool_ledger (government_sponsor_id)
  WHERE government_sponsor_id IS NOT NULL;
