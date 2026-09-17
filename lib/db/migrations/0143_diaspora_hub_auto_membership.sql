-- Migration 0143: automatic canonical Diaspora Hub membership.
--
-- Account approval and canonical home geography establish ordinary Hub
-- membership. They do not grant representative, leader, or sponsor authority.
-- Live GPS is intentionally not consulted.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS diaspora_hub_id INTEGER;

CREATE INDEX IF NOT EXISTS users_diaspora_hub_id_idx
  ON users(diaspora_hub_id);

DO $$ BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_diaspora_hub_id_fk
    FOREIGN KEY (diaspora_hub_id) REFERENCES diaspora_hubs(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Preserve an existing durable community assignment where it maps to an
-- approved canonical Hub. A local/city Hub resolves to its Globe root; this
-- backfill never reads lat/lng or location_updated_at.
WITH community_hub AS (
  SELECT DISTINCT ON (h.community_id)
    h.community_id,
    COALESCE(h.primary_hub_id, h.id) AS hub_id
  FROM diaspora_hubs h
  LEFT JOIN diaspora_hubs root ON root.id = h.primary_hub_id
  WHERE h.community_id IS NOT NULL
    AND h.status = 'approved'
    AND (h.primary_hub_id IS NULL OR root.status = 'approved')
  ORDER BY h.community_id, (h.primary_hub_id IS NULL) DESC, h.id
)
UPDATE users u
SET diaspora_hub_id = community_hub.hub_id,
    updated_at = NOW()
FROM community_hub
WHERE u.diaspora_hub_id IS NULL
  AND u.community_id = community_hub.community_id;

CREATE OR REPLACE FUNCTION ensure_canonical_diaspora_hub_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.approval_status <> 'approved' OR NEW.diaspora_hub_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only approved canonical Globe roots can be automatic home Hubs. A
  -- suspended/revoked membership is an explicit governance decision and must
  -- never be silently restored by this trigger.
  IF EXISTS (
    SELECT 1
    FROM diaspora_hubs h
    WHERE h.id = NEW.diaspora_hub_id
      AND h.status = 'approved'
      AND h.primary_hub_id IS NULL
  ) THEN
    INSERT INTO hub_memberships
      (user_id, hub_id, status, role, requested_at, approved_at)
    VALUES
      (NEW.id, NEW.diaspora_hub_id, 'approved', 'member', NOW(), NOW())
    ON CONFLICT (user_id, hub_id) DO UPDATE
      SET status = CASE
            WHEN hub_memberships.status IN ('requested', 'left') THEN 'approved'
            ELSE hub_memberships.status
          END,
          approved_at = CASE
            WHEN hub_memberships.status IN ('requested', 'left') THEN NOW()
            ELSE hub_memberships.approved_at
          END,
          updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_auto_canonical_diaspora_hub_membership ON users;

CREATE TRIGGER users_auto_canonical_diaspora_hub_membership
AFTER INSERT OR UPDATE OF approval_status, diaspora_hub_id ON users
FOR EACH ROW
EXECUTE FUNCTION ensure_canonical_diaspora_hub_membership();

-- Re-run the invariant after the trigger exists so the migration is safe for
-- existing approved users and for rows backfilled above.
UPDATE users
SET diaspora_hub_id = diaspora_hub_id
WHERE approval_status = 'approved'
  AND diaspora_hub_id IS NOT NULL;

COMMENT ON COLUMN users.diaspora_hub_id IS
  'Durable canonical Diaspora home Hub; never inferred from live GPS.';