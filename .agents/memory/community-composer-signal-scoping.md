---
name: Community composer signal scoping
description: Prevent a stale Create a Spark request from reopening the composer after Community tab navigation.
---

Filter page-level composer signals against the currently selected Community section during render. Resetting a signal only in an effect is not sufficient.

**Why:** On a tab change, a newly mounted Moments child can receive the previous tab's positive signal before the parent's effect resets it, reopening the composer unexpectedly.

**How to apply:** When editing the Home/Moments Create flow, keep the active-section guard and verify tab switching through the live Community navigation, not only by remounting a route.