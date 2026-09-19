ALTER TABLE direct_message_attachments
  ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT 'file';

ALTER TABLE direct_message_attachments
  ADD COLUMN IF NOT EXISTS link_url text;

ALTER TABLE direct_message_attachments
  ADD COLUMN IF NOT EXISTS location_lat double precision;

ALTER TABLE direct_message_attachments
  ADD COLUMN IF NOT EXISTS location_lng double precision;

ALTER TABLE direct_message_attachments
  ADD COLUMN IF NOT EXISTS location_label text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'direct_message_attachments_type_chk'
  ) THEN
    ALTER TABLE direct_message_attachments
      ADD CONSTRAINT direct_message_attachments_type_chk
      CHECK (attachment_type IN ('file', 'link', 'location'));
  END IF;
END $$;