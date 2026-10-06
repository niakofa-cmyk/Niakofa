---
name: Isolated media runtime fixtures
description: Prevent media-worker tests from colliding with files created by another database.
---

Opt-in media integration tests must use a unique local uploads directory as well as a disposable database. Worker-generated storage keys can use database asset IDs, so separate databases with fresh sequences can still address the same path in a shared uploads root. Set `MEDIA_TEST_UPLOADS_DIR` before application modules load, keep object storage disabled, and remove the temporary directory during cleanup.

**Why:** database isolation alone does not namespace filesystem object keys, so a worker test can overwrite or delete another database's local media.

**How to apply:** Before running upload or worker tests, create a fresh temporary uploads directory and pass it through `MEDIA_TEST_UPLOADS_DIR`; make the suite fail closed if it is absent, and verify cleanup before removing it.
