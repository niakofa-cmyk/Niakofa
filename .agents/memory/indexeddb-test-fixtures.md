---
name: IndexedDB test fixtures
description: Guidance for fake IndexedDB transaction objects in Node tests.
---

**Rule:** When mocking IndexedDB, return the exact transaction object whose `oncomplete`, `onerror`, and `onabort` callbacks the production code assigns. Do not spread or clone it after creating its object store.

**Why:** The fake store's queued completion callback can otherwise fire on a different object from the one the caller observes, leaving the tested persistence promise unresolved without an error.

**How to apply:** Keep the fake transaction and its store closures attached to one shared object in tests that exercise draft save, load, or delete operations.
