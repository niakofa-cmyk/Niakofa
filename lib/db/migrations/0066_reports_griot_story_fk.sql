-- reports.reported_griot_story_id has existed in schema.ts and been used by
-- griot.ts (publish-time open-report gate) and reports.ts (create/list/resolve
-- report flows) since the Griot Globe report pipeline was built, but the
-- column was never actually added to the reports table via a migration —
-- every griot story publish attempt failed with a 500 (column does not
-- exist), and the whole griot-story reporting flow was silently broken.
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "reported_griot_story_id" integer;

DO $$ BEGIN
  ALTER TABLE "reports"
    ADD CONSTRAINT "reports_reported_griot_story_id_fk"
    FOREIGN KEY ("reported_griot_story_id") REFERENCES "griot_stories"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "reports_reported_griot_story_id_idx" ON "reports" ("reported_griot_story_id");
