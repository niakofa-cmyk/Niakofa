-- Spiral discovery is product-catalog based, not geometry based.
--
-- Migration 0125 hid every neighborhood without verified geometry and every
-- city-wide Spiral behind an __inactive_neighborhood__: sentinel. GIS review
-- remains available to Admin, but it must not decide whether a curated Spiral
-- can be discovered or hosted.

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
 WHERE ac.neighborhood_id = cn.id;

-- Restore city-wide Spirals to the city key stored in their own sentinel.
UPDATE audio_circles
   SET city_key = substring(city_key from length('__inactive_neighborhood__:') + 1)
 WHERE neighborhood_id IS NULL
   AND city_key LIKE '__inactive_neighborhood__:%';
