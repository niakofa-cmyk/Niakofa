CREATE TABLE IF NOT EXISTS exchange_sparks (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES exchange_listings(id) ON DELETE CASCADE,
  author_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id integer REFERENCES communities(id) ON DELETE SET NULL,
  caption text,
  status text NOT NULL DEFAULT 'draft',
  draft_expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_sparks_listing_created_idx
  ON exchange_sparks(listing_id, created_at);
CREATE INDEX IF NOT EXISTS exchange_sparks_author_created_idx
  ON exchange_sparks(author_user_id, created_at);
CREATE INDEX IF NOT EXISTS exchange_sparks_status_created_idx
  ON exchange_sparks(status, created_at);
CREATE INDEX IF NOT EXISTS exchange_sparks_draft_expiry_idx
  ON exchange_sparks(status, draft_expires_at);

CREATE OR REPLACE FUNCTION reject_media_assets_for_deleting_exchange_spark()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  spark_owner_id integer;
  spark_status text;
BEGIN
  IF NEW.context_kind <> 'exchange_spark' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.context_kind = OLD.context_kind
    AND NEW.context_id = OLD.context_id
    AND NEW.owner_user_id = OLD.owner_user_id THEN
    RETURN NEW;
  END IF;

  SELECT author_user_id, status INTO spark_owner_id, spark_status
  FROM exchange_sparks
  WHERE id = NEW.context_id
  FOR SHARE;

  IF spark_owner_id IS NULL
    OR spark_owner_id <> NEW.owner_user_id
    OR spark_status <> 'draft' THEN
    RAISE EXCEPTION 'Exchange Spark is not accepting new media assets'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_assets_exchange_spark_context_upload_guard ON media_assets;
CREATE TRIGGER media_assets_exchange_spark_context_upload_guard
  BEFORE INSERT OR UPDATE OF context_kind, context_id, owner_user_id ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION reject_media_assets_for_deleting_exchange_spark();