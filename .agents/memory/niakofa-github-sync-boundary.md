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

When the authenticated GitHub API creates a commit but the shell remote cannot
fetch it, the API's ISO timestamp may normalize the commit's original timezone
offset and omit details such as the final message newline. Use the API's tree,
parent, author, committer, and message metadata before treating a locally
reconstructed commit as identical.

**Why:** A branch hash comparison is only meaningful when the local commit
object itself matches the remote object; matching file contents alone is not
enough.

**How to apply:** Prefer an authenticated API read of the published commit
object, then compare refs after synchronization. Do not create another remote
commit just to repair local history unless exact object reconstruction is
impossible.