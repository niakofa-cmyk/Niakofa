-- 0096_legacy_place_discoveries.sql
--
-- WHY THIS EXISTS:
-- The Legacy Mode design docs describe a Pokemon-Go-style world where family
-- landmarks are discovered by physically visiting them ("Roots Traveler —
-- Visit ten family landmarks"), and legacy-map.ts's own docstring already
-- flags that the World Map was read-only ("real pins... instead of a
-- fabricated/static stage list") — it had no concept of a place being
-- *visited*, only *tagged*. legacy-achievements.ts's "roots_traveler"
-- achievement silently counted family_places rows (i.e. data entry), not
-- real-world visits, which is exactly the "achievements are simulated" gap
-- called out in the design docs.
--
-- This table is the source of truth for real GPS check-ins. One row per
-- family+place: the first family member to physically check in "discovers"
-- it for the whole family (matches the family-scoped achievement model
-- already used by legacy_achievements). We keep who found it and their
-- reported coordinates/accuracy for auditability, but discovery is a
-- family-level fact, not a per-user counter.
--
-- Idempotent: uses IF NOT EXISTS throughout.

CREATE TABLE IF NOT EXISTS legacy_place_discoveries (
  id                  serial PRIMARY KEY,
  family_id           integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  place_id            integer NOT NULL REFERENCES family_places(id) ON DELETE CASCADE,
  discovered_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  lat                 double precision,
  lng                 double precision,
  accuracy_meters     double precision,
  distance_meters     double precision,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS legacy_place_discoveries_unique_place
  ON legacy_place_discoveries (family_id, place_id);

CREATE INDEX IF NOT EXISTS idx_legacy_place_discoveries_family
  ON legacy_place_discoveries (family_id);
