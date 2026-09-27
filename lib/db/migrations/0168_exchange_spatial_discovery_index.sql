-- Exchange nearby discovery uses a latitude/longitude bounding-box predicate followed
-- by exact Haversine distance in the API. This partial B-tree index matches that
-- predicate and excludes rows that can never be returned by public discovery.
CREATE INDEX IF NOT EXISTS exchange_listings_geo_idx
  ON exchange_listings(latitude, longitude, created_at DESC, id DESC)
  WHERE status = 'active'
    AND moderation_status = 'approved'
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL;
