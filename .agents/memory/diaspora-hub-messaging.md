---
name: Diaspora Hub messaging
description: Durable direct Hub messaging uses canonical pairs and approved membership at every write boundary.
---

Direct Diaspora Hub messaging must remain a durable database-backed conversation between two approved Hubs. Canonicalize the pair by ordered Hub IDs, authorize the sending Hub from server-side membership, and never trust client-supplied Hub ownership.

**Why:** Hub-to-Hub communication must not create duplicate threads or let a member impersonate an unrelated Hub.

**How to apply:** Keep conversation creation, message reads, and message sends behind authenticated membership checks; keep the UI explicit about the sending Hub and cap message bodies at 2,000 characters.