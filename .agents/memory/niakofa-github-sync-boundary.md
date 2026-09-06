---
name: GitHub sync boundary
description: Safe synchronization rule for the public Niakofa repository when GitHub write authorization is unavailable.
---

The Niakofa repository can be inspected and fetched from its public GitHub
source without credentials, but a local commit is not evidence that GitHub
`main` changed. When the supported GitHub connection is unavailable, verify
the public branch hash independently and stop at the push boundary rather than
using a token pasted into chat or force-pushing.

**Why:** The repository is public for reads, while write authorization is
separate; an attempted push can fail before identifying a usable remote even
when the local checkout is otherwise valid.

**How to apply:** Compare local `HEAD` with the public `main` ref after every
push attempt. If the HTTPS remote rejects authentication, use the attached
GitHub connection's authenticated API for the write and then compare both
hashes independently; never paste or print a token.

**Why:** The shell-backed HTTPS remote rejected authentication in this
workspace, while the supported GitHub connection could read and confirm the
public ref without exposing credentials.

The authenticated GitHub API publication path is confirmed to work for this
repository: it can upload the local tree, advance `main`, and reproduce the
local commit SHA when the tree, parent, author, committer, and message bytes
are preserved exactly.

**Why:** The shell credential helper may reject an otherwise valid installed
GitHub connection, but the connection-backed API can publish safely without
accessing the token value.

**How to apply:** Prefer the connector-backed Git Data API when the runtime
does not expose the documented gitPush callback. Guard the ref update on an
exact tree and commit SHA match; otherwise stop before moving `main`.

The GitHub commit endpoint preserves the supplied message bytes, so a local
Git commit's final newline matters. A message with no final newline or two
final newlines creates a different SHA even when all files and metadata match.

**Why:** A branch hash comparison is only meaningful when the local commit
object itself matches the remote object; matching file contents alone is not
enough.

**How to apply:** Read the authenticated remote ref after synchronization and
compare it to local `HEAD`; never infer a successful push from a local branch
state alone.