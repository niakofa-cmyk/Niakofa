---
name: GitHub sync boundary
description: Safe synchronization rule for the private Niakofa repository when GitHub write authorization is unavailable.
---

Repository visibility and shell read access can change. A local commit is
never evidence that GitHub `main` changed. When a supported managed
credential or GitHub connection is unavailable, stop at the push boundary
rather than using a token pasted into chat or force-pushing.

**Why:** An earlier shell pull failed authentication while the installed
connection worked; a later unauthenticated read succeeded. Do not assume
the earlier visibility or credential behavior still applies.

**How to apply:** Compare local `HEAD` with a fresh remote `main` ref after
every push attempt. If the default HTTPS helper rejects authentication,
prefer a one-shot helper using an existing workspace-managed credential for
full Git transport; otherwise use the attached connection's authenticated
API. Never paste, print, or persist a token.

Niakofa's Railway production service is connected to the GitHub repository's
`main` branch, and pushes to that branch automatically trigger deployment.
Recheck the active source and branch before publishing because external
deployment configuration can change; get explicit user confirmation before
any push that will deploy.

**Why:** A routine GitHub push can release production code even when no manual
deploy action is used.

**How to apply:** Treat a confirmed push-to-deploy as a production release.
Do not use Railway's manual deploy controls unless separately authorized.

An installed GitHub integration may still be `not_added` in the current
execution context. Resolve its exact connection ID and bind it before calling
`listConnections("github")`; an empty credential list is not proof that the
integration is unavailable.

**Why:** The workspace showed GitHub as installed while the first credential
lookup returned no connection until the existing authorized connection was
attached to the Repl.

**How to apply:** Use the integration status directory and `addIntegration`
for the exact existing connection, then use the connector-backed API without
handling credentials directly.

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

**How to apply:** Prefer full Git transport for large binary files when an
existing managed credential is available. Otherwise use the connector-backed
Git Data API and guard the ref update on exact blob, tree, and commit SHA
matches; stop before moving `main` on any mismatch.

The GitHub commit endpoint preserves the supplied message bytes, so a local
Git commit's final newline matters. A message with no final newline or two
final newlines creates a different SHA even when all files and metadata match.

**Why:** A branch hash comparison is only meaningful when the local commit
object itself matches the remote object; matching file contents alone is not
enough.

**How to apply:** Read the authenticated remote ref after synchronization and
compare it to local `HEAD`; never infer a successful push from a local branch
state alone.

Binary Git Data API uploads must be verified by decoding the exact base64 payload
and comparing byte length before advancing the ref. For exact commit parity,
GitHub's API-normalized UTC dates may correspond to a raw commit timezone offset;
reconstruct the parent and child objects from the raw epoch/offset metadata, not
the displayed ISO timezone alone.

**Why:** A truncated binary blob changed the remote tree even though the text
blobs matched, and a local commit with the same visible metadata still differed
until its raw timezone offset was preserved.

**How to apply:** Compare every changed blob SHA and tree SHA first. If a shell
fetch cannot authenticate, use the connection-backed commit metadata and only
move local refs after the independently computed commit SHA matches GitHub.

When publishing source changes through the connector, leave the transient API
server bundle out of the source commit when the deployment build regenerates it
from `artifacts/api-server/src`. Keep migrations, contracts, generated client
types, and application source in the published tree.

**Why:** The deployment build already runs the API build from source, while
large generated bundles are needlessly costly and risk transport truncation
through connector-backed Git Data writes.

**How to apply:** Verify the source tree and all changed blobs against local
`HEAD` before advancing `main`; do not treat a locally regenerated bundle as a
required release artifact for this path.