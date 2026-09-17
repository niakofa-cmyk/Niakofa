-- Migration 0142: explicit Hub membership lifecycle.
--
-- Membership is requested explicitly and may be approved, suspended, revoked,
-- or left. Location and community linkage never grant representation.

ALTER TABLE hub_memberships
  DROP CONSTRAINT IF EXISTS hub_memberships_status_check;

ALTER TABLE hub_memberships
  ADD CONSTRAINT hub_memberships_status_check
  CHECK (status IN ('requested', 'approved', 'suspended', 'revoked', 'left'));

COMMENT ON COLUMN hub_memberships.status IS
  'Explicit lifecycle: requested, approved, suspended, revoked, or left.';