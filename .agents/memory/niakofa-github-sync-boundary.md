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
push attempt. A workspace secret callback may be unavailable even when the
shell environment has an authorized token; use shell variable expansion for
one token-authenticated push without printing the value, then fetch and compare
both hashes independently.

**Why:** The shell-backed GitHub credential was available in this production
session while the sandbox secret callback returned no value; the push succeeded
only through the supported environment boundary, and the post-push fetch proved
the public branch matched exactly.