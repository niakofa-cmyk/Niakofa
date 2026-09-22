---
name: Niakofa reports.reported_griot_story_id migration gap
description: A schema column referenced in route code but never migrated into the DB, crashing griot story publish and the whole story-report pipeline.
---

`lib/db/src/schema/reports.ts` declared `reported_griot_story_id` and `griot.ts`
(publish-time open-report gate) + `reports.ts` (create/list/resolve) all used
it, but no migration ever ran `ALTER TABLE reports ADD COLUMN`. Every story
publish attempt 500'd with "column does not exist" and the entire
griot-story reporting flow was broken.

**Why:** schema.ts and migrations/*.sql are two separate sources of truth in
this repo — adding a field to schema.ts does not by itself create the column.
Someone added the column to schema.ts (and wrote the routes that use it)
without writing the corresponding migration.

**How to apply:** whenever a route references a column/table that "should"
exist per schema.ts but errors with a Postgres "column/relation does not
exist", check whether a migration actually created it — don't assume schema.ts
parity with migrations. Fixed via migration `0066_reports_griot_story_fk.sql`
(adds column + FK + index, idempotent with IF NOT EXISTS / duplicate_object
guard).
