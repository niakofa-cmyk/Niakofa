-- Spiral discovery is product-catalog based, not geometry based.
--
-- Migration 0125 hid every neighborhood without verified geometry and every
-- city-wide Spiral behind an __inactive_neighborhood__: sentinel. GIS review
-- remains available to Admin, but it must not decide whether a curated Spiral
-- can be discovered or hosted.
--
-- Production already has active city-wide rows (audio_circles_citywide_uniq).
-- Restoring sentinel keys onto those city keys must not create duplicates.

CREATE OR REPLACE FUNCTION sync_audio_spiral_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_city_key text;
BEGIN
  -- Repair legacy sentinel values when a row is touched. New application
  -- writes already use canonical city keys.
  IF NEW.city_key LIKE '__inactive_neighborhood__:%' THEN
    IF NEW.neighborhood_id IS NOT NULL THEN
      SELECT cn.city_key
        INTO canonical_city_key
        FROM city_neighborhoods cn
       WHERE cn.id = NEW.neighborhood_id;
    END IF;

    NEW.city_key := COALESCE(
      canonical_city_key,
      substring(NEW.city_key from length('__inactive_neighborhood__:') + 1)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sync_neighborhood_spiral_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Keep the catalog city identity synchronized for Admin edits, but never
  -- use geometry_verified as a discovery or hosting gate.
  UPDATE audio_circles
     SET city_key = NEW.city_key,
         city_display = NEW.city_display
   WHERE neighborhood_id = NEW.id;

  RETURN NEW;
END;
$$;

-- Restore neighborhood Spirals to their catalog city keys.
UPDATE audio_circles ac
   SET city_key = cn.city_key,
       city_display = cn.city_display
  FROM city_neighborhoods cn
 WHERE ac.neighborhood_id = cn.id
   AND (
     ac.city_key IS DISTINCT FROM cn.city_key
     OR ac.city_display IS DISTINCT FROM cn.city_display
   );

-- City-wide: if a sentinel row would collide with an existing city-wide row
-- for the same canonical city_key, drop the sentinel duplicate and keep the
-- already-active city-wide Spiral.
DELETE FROM audio_circles AS sentinel
 WHERE sentinel.neighborhood_id IS NULL
   AND sentinel.city_key LIKE '__inactive_neighborhood__:%'
   AND EXISTS (
     SELECT 1
       FROM audio_circles AS active
      WHERE active.neighborhood_id IS NULL
        AND active.city_key = substring(
              sentinel.city_key from length('__inactive_neighborhood__:') + 1
            )
        AND active.id IS DISTINCT FROM sentinel.id
   );

-- Restore remaining city-wide Spirals that only exist under the sentinel key.
UPDATE audio_circles
   SET city_key = substring(city_key from length('__inactive_neighborhood__:') + 1)
 WHERE neighborhood_id IS NULL
   AND city_key LIKE '__inactive_neighborhood__:%'
   AND NOT EXISTS (
     SELECT 1
       FROM audio_circles AS other
      WHERE other.neighborhood_id IS NULL
        AND other.city_key = substring(
              audio_circles.city_key from length('__inactive_neighborhood__:') + 1
            )
        AND other.id IS DISTINCT FROM audio_circles.id
   );
