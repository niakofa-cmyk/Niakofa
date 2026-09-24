---
name: CI package working directories
description: Repository-specific test-runner behavior that affects trustworthy CI reproduction.
---

API source-contract Jest tests resolve relative paths from `artifacts/api-server`, so reproducing them from the workspace root can report false missing-file failures even when the CI command is correct.

**Why:** The CI filter runs the API package script with that package as its working directory; a root-level Jest invocation is not equivalent.

**How to apply:** Reproduce API CI failures with the package script or by changing into `artifacts/api-server` before invoking Jest. Use the current CI run as the final result after local reproduction.