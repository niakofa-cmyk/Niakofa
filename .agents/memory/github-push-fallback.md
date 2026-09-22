---
name: GitHub push fallback
description: How to publish repository commits when the local HTTPS origin cannot authenticate.
---

When the local GitHub HTTPS remote rejects credentials, use the bound Replit
GitHub connector instead of requesting a token or changing the remote URL.
Verify the remote branch first, then write the changed blobs, tree, commit, and
branch ref through the authenticated GitHub API without force-pushing.

**Why:** The workspace can have a healthy GitHub OAuth connection while the
local Git credential helper has no usable token.

**How to apply:** Confirm the remote branch still equals the local commit's
parent, create a non-forced commit from that parent, and verify the resulting
remote ref and changed-file blob hashes.