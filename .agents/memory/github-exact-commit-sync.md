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

The connection-backed GitHub API can truncate request bodies near the 100 KB
boundary; a large text blob may be accepted with a different SHA even when
smaller sibling blobs are exact.

**Why:** The route source blob exceeded the connector's request-size boundary
when base64-encoded, so GitHub created a valid but truncated orphan commit.

**How to apply:** Compare each returned blob SHA before updating the ref. For
large files, prefer the supported Git push path or another transport that
preserves the full blob; never advance `main` after a partial upload.

The GitHub connector may return `429` for parallel Git Data API blob creation
even when the account rate limit is healthy. Upload changed blobs sequentially
with backoff, then create and verify the tree before advancing the ref.

**Why:** A concurrent exact-tree upload was throttled before any ref update;
the same payload succeeded sequentially without changing the publication
boundary.

**How to apply:** Treat a connector `429` as a transport throttle, not
permission to retry concurrently; preserve the no-ref-update gate until all
blob and tree SHAs match.