-- Internal operator designation for approved disposable test identities.
-- Default existing and newly registered accounts to non-disposable.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_disposable_test_account boolean NOT NULL DEFAULT false;
