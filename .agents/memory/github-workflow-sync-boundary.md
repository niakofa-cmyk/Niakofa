---
name: GitHub workflow sync boundary
description: The attached GitHub OAuth connection can write repository code but currently lacks the workflow scope for .github workflow files.
---

The connected GitHub OAuth grant has previously provided repository write access
without the `workflow` scope. Writes involving `.github/workflows/*` can then be
rejected even though ordinary Git blob, tree, commit, and ref operations succeed.
A workspace-managed PAT is not automatically proof of workflow or repository
write permission; an authenticated HTTPS push can still return 403.

**Why:** GitHub reported the connector's repository scope without workflow scope, rejected a tree containing a workflow path, and independently rejected a managed-token push. Permission must be verified, not inferred from a secret's presence.

**How to apply:** Sync ordinary source and documentation through the authenticated connector with exact tree/commit checks. If workflow editing is unavailable, preserve CI coverage through an existing gated entrypoint where sound, and say clearly that the workflow file was not changed. For a required workflow-file edit, obtain an explicitly authorized write+workflow grant instead of trying unverified tokens; never expose credential values.

On 2026-10-16, a nonlogging transient Git credential helper using the existing
workspace-managed credential passed the push preflight. GitHub's response
confirmed both repository and workflow scopes for that credential. This does
not establish the scopes of the separate OAuth connector.

**Why:** Credential paths differ; the earlier OAuth limitation must not be
misreported as a permanent inability to push CI workflow improvements.

**How to apply:** Prefer normal, non-forced Git transport for large generated
contracts when the approved credential passes preflight. Keep credentials out of
remote URLs, files and logs; verify remote HEAD independently after the real push.