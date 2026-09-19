DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'direct_message_attachments_type_check'
  ) THEN
    ALTER TABLE "direct_message_attachments"
      ADD CONSTRAINT "direct_message_attachments_type_check"
      CHECK ("attachment_type" IN ('file', 'link', 'location', 'story'));
  END IF;
END $$;