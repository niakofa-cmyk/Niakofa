-- Migration 0141: explicit Diaspora Hub membership / representation.
--
-- Location and account identity do not grant Hub representation. Existing
-- community-linked users and approved Hub leaders are backfilled so this
-- hardening preserves legitimate current senders.

CREATE TABLE IF NOT EXISTS hub_memberships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hub_id INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'requested',
  role TEXT NOT NULL DEFAULT 'member',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hub_memberships_status_check
    CHECK (status IN ('requested','approved','suspended','left')),
  CONSTRAINT hub_memberships_role_check
    CHECK (role IN ('member','representative','leader')),
  CONSTRAINT hub_memberships_approved_fields_check
    CHECK ((status = 'approved' AND approved_at IS NOT NULL) OR status <> 'approved')
);

CREATE UNIQUE INDEX IF NOT EXISTS hub_memberships_user_hub_unique
  ON hub_memberships(user_id, hub_id);

CREATE INDEX IF NOT EXISTS hub_memberships_hub_status_idx
  ON hub_memberships(hub_id, status);

CREATE INDEX IF NOT EXISTS hub_memberships_user_status_idx
  ON hub_memberships(user_id, status);

INSERT INTO hub_memberships
  (user_id, hub_id, status, role, requested_at, approved_at)
SELECT u.id, h.id, 'approved', 'member', NOW(), NOW()
FROM users u
JOIN diaspora_hubs h ON h.community_id = u.community_id
WHERE h.status = 'approved' AND u.community_id IS NOT NULL
ON CONFLICT (user_id, hub_id) DO NOTHING;

INSERT INTO hub_memberships
  (user_id, hub_id, status, role, requested_at, approved_at, approved_by)
SELECT hcl.user_id, hcl.hub_id, 'approved', 'leader', NOW(), NOW(), hcl.approved_by
FROM hub_community_leaders hcl
JOIN diaspora_hubs h ON h.id = hcl.hub_id
WHERE h.status = 'approved' AND hcl.approved = TRUE
ON CONFLICT (user_id, hub_id) DO UPDATE
SET status = 'approved',
    role = 'leader',
    approved_at = COALESCE(hub_memberships.approved_at, NOW()),
    approved_by = COALESCE(EXCLUDED.approved_by, hub_memberships.approved_by),
    updated_at = NOW();

COMMENT ON TABLE hub_memberships IS
  'Explicit Diaspora Hub membership. Location is not membership; approved membership permits Hub representation.';