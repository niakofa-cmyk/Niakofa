---
name: GitHub workflow sync boundary
description: The attached GitHub OAuth connection can write repository code but currently lacks the workflow scope for .github workflow files.
---

The connected GitHub OAuth grant includes repository write access but not the `workflow` scope. Writes involving `.github/workflows/*` can therefore be rejected even though ordinary Git blob, tree, commit, and ref operations succeed.

**Why:** GitHub reported the active scopes as `repo` plus read/user scopes, while workflow-path writes returned authorization-style 403/404 responses.

**How to apply:** Sync ordinary source and documentation through the authenticated connector, but treat CI workflow changes as a separate operator gate. Do not fall back to raw `git push` or claim the workflow file was synchronized without a grant that includes `workflow`.