-- Active Spirals are the authoritative neighborhood Spirals only.
-- A neighborhood becomes discoverable when its reviewed geometry is verified.
-- Keep inactive rows intact for referential history; hide them from the
-- discovery city_key instead of deleting circles, sessions, or follows.

CREATE OR REPLACE FUNCTION sync_audio_spiral_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Discovery is neighborhood-only. City-wide circles remain addressable by
  -- id for backwards compatibility but are never part of the Spiral list.
  IF NEW.neighborhood_id IS NULL THEN
    NEW.city_key := '__inactive_neighborhood__:' || NEW.city_key;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM city_neighborhoods cn
    WHERE cn.id = NEW.neighborhood_id
      AND cn.geometry_verified IS TRUE
  ) THEN
    NEW.city_key := '__inactive_neighborhood__:' || NEW.city_key;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audio_circles_active_neighborhood_visibility ON audio_circles;
CREATE TRIGGER audio_circles_active_neighborhood_visibility
BEFORE INSERT OR UPDATE OF neighborhood_id, city_key
ON audio_circles
FOR EACH ROW
EXECUTE FUNCTION sync_audio_spiral_visibility();

CREATE OR REPLACE FUNCTION sync_neighborhood_spiral_visibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.geometry_verified IS TRUE THEN
    UPDATE audio_circles
       SET city_key = NEW.city_key,
           city_display = NEW.city_display
     WHERE neighborhood_id = NEW.id
       AND city_key LIKE '__inactive_neighborhood__:%';
  ELSE
    UPDATE audio_circles
       SET city_key = '__inactive_neighborhood__:' || NEW.city_key,
           city_display = NEW.city_display
     WHERE neighborhood_id = NEW.id
       AND city_key NOT LIKE '__inactive_neighborhood__:%';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS city_neighborhoods_active_spiral_visibility ON city_neighborhoods;
CREATE TRIGGER city_neighborhoods_active_spiral_visibility
AFTER UPDATE OF geometry_verified, city_key
ON city_neighborhoods
FOR EACH ROW
EXECUTE FUNCTION sync_neighborhood_spiral_visibility();

-- Apply the policy to existing provisioned circles without deleting history.
UPDATE audio_circles ac
SET city_key = '__inactive_neighborhood__:' || cn.city_key
FROM city_neighborhoods cn
WHERE ac.neighborhood_id = cn.id
  AND cn.geometry_verified IS NOT TRUE
  AND ac.city_key NOT LIKE '__inactive_neighborhood__:%';

-- Hide existing city-wide circles from discovery while retaining their rows.
UPDATE audio_circles
SET city_key = '__inactive_neighborhood__:' || city_key
WHERE neighborhood_id IS NULL
  AND city_key NOT LIKE '__inactive_neighborhood__:%';

-- Restore any already-verified neighborhood circles that were previously hidden.
UPDATE audio_circles ac
SET city_key = cn.city_key,
    city_display = cn.city_display
FROM city_neighborhoods cn
WHERE ac.neighborhood_id = cn.id
  AND cn.geometry_verified IS TRUE
  AND ac.city_key LIKE '__inactive_neighborhood__:%';
