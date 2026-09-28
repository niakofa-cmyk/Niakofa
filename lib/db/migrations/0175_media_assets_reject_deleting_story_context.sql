-- Serialize V21 Story upload-session inserts against Story deletion. The row
-- lock makes an insert that began before deletion visible to the cleanup scan,
-- while an insert that arrives afterward is rejected.
CREATE OR REPLACE FUNCTION reject_media_assets_for_deleting_story()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  story_status text;
BEGIN
  IF NEW.context_kind <> 'story' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.context_kind = OLD.context_kind
    AND NEW.context_id = OLD.context_id
    AND NEW.status IS DISTINCT FROM 'processing' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO story_status
  FROM community_stories
  WHERE id = NEW.context_id
  FOR SHARE;

  IF story_status IS NULL OR story_status = 'deletion_pending' THEN
    RAISE EXCEPTION 'Story is not accepting new media assets'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_assets_story_context_upload_guard ON media_assets;
CREATE TRIGGER media_assets_story_context_upload_guard
  BEFORE INSERT OR UPDATE OF context_kind, context_id, status ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION reject_media_assets_for_deleting_story();