-- Ensure every neighborhood record has its compatibility-backed Spiral row at creation time.
-- Discovery still filters to active, geometry-verified neighborhoods; this only
-- removes the first-request provisioning race for newly materialized cities.

INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
SELECT cn.city_key, cn.city_display, cn.id, cn.name || ' Spiral'
FROM city_neighborhoods cn
ON CONFLICT (neighborhood_id) WHERE neighborhood_id IS NOT NULL DO NOTHING;

CREATE OR REPLACE FUNCTION ensure_neighborhood_spiral_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO audio_circles (city_key, city_display, neighborhood_id, name)
  VALUES (NEW.city_key, NEW.city_display, NEW.id, NEW.name || ' Spiral')
  ON CONFLICT (neighborhood_id) WHERE neighborhood_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS city_neighborhoods_ensure_spiral ON city_neighborhoods;
CREATE TRIGGER city_neighborhoods_ensure_spiral
AFTER INSERT ON city_neighborhoods
FOR EACH ROW
EXECUTE FUNCTION ensure_neighborhood_spiral_row();
