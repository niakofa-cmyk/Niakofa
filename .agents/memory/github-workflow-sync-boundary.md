---
name: GitHub workflow sync boundary
description: The attached GitHub OAuth connection can write repository code but currently lacks the workflow scope for .github workflow files.
---

The connected GitHub OAuth grant includes repository write access but not the `workflow` scope. Writes involving `.github/workflows/*` can therefore be rejected even though ordinary Git blob, tree, commit, and ref operations succeed. A workspace-managed PAT is not proof of workflow or even repository write permission; an authenticated HTTPS push can still return 403.

**Why:** GitHub reported the connector's repository scope without workflow scope, rejected a tree containing a workflow path, and independently rejected a managed-token push. Permission must be verified, not inferred from a secret's presence.

**How to apply:** Sync ordinary source and documentation through the authenticated connector with exact tree/commit checks. If workflow editing is unavailable, preserve CI coverage through an existing gated entrypoint where sound, and say clearly that the workflow file was not changed. For a required workflow-file edit, obtain an explicitly authorized write+workflow grant instead of trying unverified tokens; never expose credential values.