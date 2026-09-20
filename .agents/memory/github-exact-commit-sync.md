---
name: GitHub exact-commit sync
description: Preserve local commit SHA parity when publishing through the authenticated GitHub Git Data API.
---

When publishing a local commit through GitHub's Git Data API, verify the tree
first and compare the returned commit SHA before updating the branch ref.
The Git Data API can produce a commit whose raw message bytes differ from a
local `git commit` even when the API metadata looks identical. In one verified
publication, the API commit matched the local object after removing the local
message's final newline, so exact SHA parity may require reconstructing the
local commit object from the returned tree, parent, identity, timestamp, and
observed raw message bytes.

**Why:** the repository requires remote `main` to match local `main` exactly,
and a valid tree/parent is not sufficient if commit-object bytes differ.

**How to apply:** create blobs and the tree, create the commit without moving
the ref, fetch the created commit object for byte comparison, reconstruct the
local commit if necessary, and only then patch `refs/heads/main`.

The connector-created commit may report its author/committer date as UTC through
the REST API while storing a different raw message-terminal convention than
workspace-local Git. `git commit-tree` can normalize these bytes differently;
construct the verified raw commit object when exact SHA parity matters.

**Why:** a visually identical tree and API metadata can still produce a
different commit SHA when timezone and message-terminal bytes differ.

**How to apply:** compare the candidate SHA by rebuilding the raw commit from
the returned tree, parent, identity, epoch, offset, and exact message bytes
before advancing the branch ref.

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

For large text blobs, the connection-backed proxy can avoid base64 expansion by
using UTF-8 blob payloads, but every returned blob SHA must still match the
local object before the tree or ref is considered safe.

**Why:** Base64 increases request size near the connector's body limit, while a
successful-looking upload is not evidence that the remote blob is complete.

**How to apply:** Upload text blobs sequentially with `encoding: "utf-8"`,
compare each SHA, and stop before tree/ref creation on any mismatch.

Normalize CRLF output from shell-backed Git reads before parsing commit headers
or comparing refs, and use base64 blob uploads when the connector's UTF-8 path
changes line endings.

**Why:** Shell output can append `\r` to paths and commit fields, while the
connector can normalize UTF-8 payloads; both produce misleading parity failures
even when the checked-out source is correct.

**How to apply:** Strip `\r` from metadata/path transport values, verify every
blob SHA, verify the complete tree SHA, then create and compare the commit
before advancing the branch ref.

When the remote ref has already advanced but the connector cannot expose the raw
commit object for local import, do not point a local ref at an unknown object;
leave the verified workspace changes staged until an authenticated Git read can
reconcile the local commit.

**Why:** a remote SHA without its local object is not a usable local checkout,
and forcing the ref creates a broken repository state.

**How to apply:** treat the GitHub ref and deployed commit as authoritative,
preserve the staged tree, and reconcile through an authenticated fetch later.

After creating the local commit, build any publication manifest from the
committed diff (`HEAD^..HEAD`), not the staging index; a successful `git commit`
leaves `git diff --cached` empty.

**Why:** using the empty index can produce an invalid empty Git Data API tree
even though the local commit is complete.

**How to apply:** capture changed paths and blob bytes before committing, or
read them from the committed diff after committing, then verify the tree before
creating or advancing the remote ref.