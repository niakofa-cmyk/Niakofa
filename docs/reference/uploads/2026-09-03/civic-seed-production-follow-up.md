# Civic seed production-readiness continuation

This reference records the civic coverage follow-up from the September 3, 2026
build session. The uploaded conversation notes remain preserved in
`attached_assets/`; this file captures the actionable engineering contract
without copying credentials or secret values.

## Required guard

`scripts/src/seed-civic-coverage.ts` runs during API startup and must tolerate
legacy/imported rows whose `civic_resources.id` serial sequence is behind the
stored maximum. The seed repairs the sequence before national baselines,
county coverage, or verified city resources are inserted.

## Regression proof

The database-backed regression command is:

```text
pnpm --filter @workspace/scripts run test:civic-seed
```

It requires the explicitly named `CIVIC_SEED_TEST_DATABASE_URL`; it never
falls back to `DATABASE_URL`. The test creates a disposable schema, inserts an
ID-50000 imported sentinel, runs the real seed twice with the verified offline
Texas Census fallback, checks Fort Worth and Dallas coverage, and requires the
second run to produce the identical row set. The schema is dropped in teardown.

## CI and release boundary

CI uses a PostGIS-enabled PostgreSQL service and applies the canonical
migrations before running the civic regression. A plain PostgreSQL image is not
an adequate migration gate because the migration chain optionally creates and
uses PostGIS objects. The migration runner keeps its production TLS default;
CI explicitly opts out with `DATABASE_SSL=false` because GitHub service
containers are local non-TLS connections.

The legacy hand-drawn art archive is tracked through Git LFS. If GitHub LFS
authorization is unavailable, keep the committed pointer intact and do not
replace the archive with an invented or unverified asset.