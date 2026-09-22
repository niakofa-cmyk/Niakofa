---
name: GitHub OAuth publishing
description: Repository synchronization behavior for this workspace’s connected GitHub publishing flow.
---

The GitHub connector’s commit API serializes the commit message without the trailing newline produced by a normal local git commit, so the commit SHA can differ even when tree, parent, and metadata match.

**Why:** Treating a SHA mismatch as a content mismatch can cause an unnecessary rollback or duplicate push.

**How to apply:** Publish through the connected GitHub OAuth flow, then compare the remote `main` ref directly with local `HEAD`. Let the workspace reconcile local refs after a successful push and verify the working tree is clean.