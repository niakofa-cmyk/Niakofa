---
name: GitHub OAuth publishing
description: Repository synchronization behavior for this workspace’s connected GitHub publishing flow.
---

The GitHub connector’s commit API serializes the commit message without the trailing newline produced by a normal local git commit, so the commit SHA can differ even when tree, parent, and metadata match.

**Why:** Treating a SHA mismatch as a content mismatch can cause an unnecessary rollback or duplicate push.

**How to apply:** Publish through the connected GitHub OAuth flow, then compare the remote `main` ref directly with local `HEAD`. Let the workspace reconcile local refs after a successful push and verify the working tree is clean.

When reproducing a local commit through the Git Data API, capture the message from the raw commit object; `git log --format=%B` can add an extra format-separator newline and produce a different SHA.

**Why:** GitHub preserves the supplied message bytes, so one versus two trailing newlines changes the commit object even though the rendered commit title looks identical.

**How to apply:** Use the raw commit object or an explicit subject plus exactly one newline, and refuse to advance the remote ref until the returned SHA equals local `HEAD`.