-- Migration 0047: Communities table + tier stickiness + community-scoped pool health
--
-- Implements three interconnected features from the bug report:
--
-- 1. communities table — region-scoped pool funding multiplier
--    Each community has a target_reserve_amount (admin-set "healthy" pool balance).
--    The wage multiplier becomes: tier_multiplier × (balance / target_reserve),
--    clamped so a low pool can't zero out helpers' bonuses entirely.
--    Seeded with "Tarrant County" so nothing breaks on first upgrade.
--
-- 2. community_id on users — which community a user belongs to.
--    NULL until set; the app falls back to the global pool for legacy rows.
--
-- 3. community_id on community_pool_ledger — lets us compute per-community
--    balances via SUM(amount) WHERE community_id = X.
--    NULL on historical entries; they contribute to the global default bucket.
--
-- 4. highest_tier_reached on users — tier stickiness.
--    Effective tier = max(currently computed tier, highest_tier_reached).
--    Once a helper earns a tier it is recorded here permanently; it can only go
--    up, never down, and is removed only when the account is deleted.
--    Defaults to 'member' so existing users are unaffected.

-- 1. communities table
CREATE TABLE IF NOT EXISTS communities (
  id                    SERIAL       PRIMARY KEY,
  name                  TEXT         NOT NULL,
  -- admin-set "healthy" pool balance for this community (dollars)
  -- multiplier = clamp(pool_balance / target_reserve, 0.5, 1.0)
  target_reserve_amount REAL         NOT NULL DEFAULT 10000,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the initial Tarrant County community so all existing data has a home.
INSERT INTO communities (name, target_reserve_amount)
VALUES ('Tarrant County', 10000)
ON CONFLICT DO NOTHING;

-- 2. community_id on users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES communities(id);

-- 3. community_id on community_pool_ledger
ALTER TABLE community_pool_ledger
  ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES communities(id);

-- 4. highest_tier_reached on users (tier stickiness)
--    member | verified | trusted | elite | anchor
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS highest_tier_reached TEXT NOT NULL DEFAULT 'member';
