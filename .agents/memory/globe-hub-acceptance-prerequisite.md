---
name: Globe-to-Hub acceptance prerequisite
description: The account requirements for certifying authenticated Globe-to-Hub messaging in production
---

The authenticated production Globe-to-Hub journey requires a valid approved user state **and** at least one approved membership in an approved Hub. User approval alone can yield an empty `source_hubs` list and cannot certify the positive `Speaking as <Hub>` flow.

**Why:** The source Hub is a representation boundary, not a location or account-approval feature. The messaging API correctly rejects unapproved source representation, so an approved account without a Hub membership can only exercise the negative boundary path.

**How to apply:** Before running the focused browser gate, preflight the authenticated hub-message options and confirm at least one `source_hubs` entry. If it is empty, stop without requesting membership or making production mutations.