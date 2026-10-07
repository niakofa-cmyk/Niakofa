---
name: Isolated media runtime fixtures
description: Prevent media-worker tests from colliding with files created by another database.
---

Opt-in media integration tests must use a unique local uploads directory as well as a disposable database. Worker-generated storage keys can use database asset IDs, so separate databases with fresh sequences can still address the same path in a shared uploads root. Set `MEDIA_TEST_UPLOADS_DIR` before application modules load, keep object storage disabled, and remove the temporary directory during cleanup.

The API runtime Jest suite deliberately replaces plain `DATABASE_URL`; pass its disposable target through `FAMILY_STORY_RUNTIME_TEST_DATABASE_URL` and include a standalone `test` segment in the database name so its fixture-safety guard accepts it.

**Why:** database isolation alone does not namespace filesystem object keys, so a worker test can overwrite or delete another database's local media. The Jest override also prevents backend tests from reaching a workspace or production database by accident.

**How to apply:** Before running upload or worker tests, create a fresh temporary uploads directory and pass it through `MEDIA_TEST_UPLOADS_DIR`; make the suite fail closed if it is absent, and verify cleanup before removing it. For the API runtime Jest suite, set `FAMILY_STORY_RUNTIME_TEST_DATABASE_URL` to the disposable local database rather than relying on `DATABASE_URL`.
