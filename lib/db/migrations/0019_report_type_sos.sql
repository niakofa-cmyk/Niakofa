-- Add 'sos' to report_type enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'report_type'::regtype
    AND enumlabel = 'sos'
  ) THEN
    ALTER TYPE report_type ADD VALUE 'sos';
  END IF;
END$$;
