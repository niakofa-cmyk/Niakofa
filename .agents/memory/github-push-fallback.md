---
name: GitHub push fallback
description: How to publish repository commits when the local HTTPS origin cannot authenticate.
---

When the default local GitHub HTTPS credential helper rejects a push, a
one-shot, nonlogging credential helper can use an already-provisioned
workspace secret for a normal, non-forced Git push without storing or
displaying its value. Prefer this full Git transport for binary reference
assets: the connection-backed Git Data API can truncate larger blob uploads.
If no such existing credential is available, use the bound Replit GitHub
connector, verifying every blob and the tree before moving the ref.

**Why:** The workspace's default helper rejected authentication while the
existing managed credential succeeded through a temporary helper. Full Git
transport preserved a multi-megabyte image that exceeds the connector's
reliable blob-request boundary.

**How to apply:** Confirm the remote branch still equals the local commit's
parent, use a transient helper without printing or persisting the credential,
push without force, then run a separate pull and compare local HEAD, tracking
ref, remote ref, and clean working tree. Retain the connector-backed exact-SHA
gates as the fallback.