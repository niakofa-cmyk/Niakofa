---
name: Nia optional-feature gating
description: The privacy boundary required for optional Nia context requests when the feature is disabled.
---

Optional Nia context requests must wait until the shared kill-switch has resolved to enabled; a null or false state must not trigger the probe.

**Why:** The API intentionally returns 503 while Nia is disabled. Calling it from the shared Community shell creates repeated browser failures for an optional feature without indicating a Community problem.

**How to apply:** Read `niaEnabled` from the shared app context and gate every live-context fetch, including refreshes after Nia interactions. Keep the backend 503 boundary intact.