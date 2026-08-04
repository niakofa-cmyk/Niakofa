-- 0076_audio_circles_neighborhood_fk.sql
--
-- Fix audio_circles.neighborhood_id FK from CASCADE to SET NULL.
-- Deleting a city_neighborhoods row must NOT cascade-delete the audio circle.
-- The circle is an independent entity; it simply loses its neighbourhood tag.
-- Matches the SET NULL pattern used by other "soft reference" FKs in this project.

-- Drop both known names for this FK (created by different migration versions)
ALTER TABLE "audio_circles"
  DROP CONSTRAINT IF EXISTS "audio_circles_neighborhood_id_city_neighborhoods_id_fk";
ALTER TABLE "audio_circles"
  DROP CONSTRAINT IF EXISTS "audio_circles_neighborhood_id_fkey";

ALTER TABLE "audio_circles"
  ADD CONSTRAINT "audio_circles_neighborhood_id_city_neighborhoods_id_fk"
    FOREIGN KEY ("neighborhood_id")
    REFERENCES "city_neighborhoods"("id")
    ON DELETE SET NULL;
