---
name: GitHub exact-commit sync
description: Preserve local commit SHA parity when publishing through the authenticated GitHub Git Data API.
---

When publishing a local commit through GitHub's Git Data API, verify the tree
first and compare the returned commit SHA before updating the branch ref.
GitHub's commit endpoint can preserve an extra terminal newline in the commit
message even when the API response omits it, so exact SHA parity may require
reconstructing the local commit object with the observed raw message bytes.

**Why:** the repository requires remote `main` to match local `main` exactly,
and a valid tree/parent is not sufficient if commit-object bytes differ.

**How to apply:** create blobs and the tree, create the commit without moving
the ref, fetch the created commit object for byte comparison, reconstruct the
local commit if necessary, and only then patch `refs/heads/main`.

Normalize CRLF path separators before creating Git Data API tree entries; otherwise a valid tree can publish a filename ending in `\r` while leaving the intended file unchanged.