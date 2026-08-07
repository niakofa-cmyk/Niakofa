-- Migration 0063: Clean up duplicate Brazil hubs, if any.
--
-- Migration 0062 originally inserted Recife/São Luís/São Paulo under
-- different literal name strings than 0060 already used (e.g. "Recife
-- (Pernambuco)" vs 0060's "Recife, Brazil"), so ON CONFLICT (name) never
-- caught the duplication. 0062 has since been corrected to reuse 0060's
-- exact names — but if this database already ran the old version of 0062
-- before that fix landed, it will have duplicate rows for these three
-- cities. This migration removes them, keeping whichever row is older
-- (0060's, since it always runs first) and preferring is_seed = true when
-- there's a choice, without touching any legitimate community-submitted
-- hub that happens to share a similar city name.
DELETE FROM diaspora_hubs d
USING (
  SELECT id
  FROM (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY lower(regexp_replace(name, '\s*\([^)]*\)|,\s*Brazil\s*$', '', 'g'))
        ORDER BY is_seed DESC, id ASC
      ) AS rn
    FROM diaspora_hubs
    WHERE name IN (
      'Recife, Brazil', 'Recife (Pernambuco)',
      'São Luís, Brazil', 'São Luís (Maranhão)',
      'São Paulo, Brazil', 'São Paulo'
    )
  ) ranked
  WHERE rn > 1
) dupes
WHERE d.id = dupes.id;
