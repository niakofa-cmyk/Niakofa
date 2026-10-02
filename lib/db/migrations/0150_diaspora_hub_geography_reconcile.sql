-- Migration 0150: reconcile the persisted canonical Hub geography constraint.
--
-- Migration 0139 was previously applied with a stricter version of this
-- constraint. Editing an applied migration does not change the database, and
-- 0139's duplicate_object handler intentionally left that older definition in
-- place. Recreate it here so proposals can remain pending until review while
-- approved canonical roots still require complete country/state geography.

ALTER TABLE diaspora_hubs
  DROP CONSTRAINT IF EXISTS diaspora_hubs_globe_geography_check;

ALTER TABLE diaspora_hubs
  ADD CONSTRAINT diaspora_hubs_globe_geography_check
  CHECK (
    status <> 'approved'
    OR primary_hub_id IS NOT NULL
    OR (
      (
        hub_scope = 'country'
        AND country_code IS NOT NULL
        AND upper(country_code) <> 'US'
        AND subdivision_code IS NULL
      )
      OR
      (
        hub_scope = 'us_state'
        AND upper(country_code) = 'US'
        AND subdivision_code IS NOT NULL
      )
    )
  ) NOT VALID;

ALTER TABLE diaspora_hubs
  VALIDATE CONSTRAINT diaspora_hubs_globe_geography_check;

COMMENT ON CONSTRAINT diaspora_hubs_globe_geography_check ON diaspora_hubs IS
  'Approved canonical Globe Hubs are non-US countries or US states; pending proposals and grouped local rows remain writable.';