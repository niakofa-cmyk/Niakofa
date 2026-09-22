---
name: CI contract validation
description: Keep tests deterministic when infrastructure can be present locally, and keep canonical-route contracts separate from compatibility-route coverage.
---

Tests for development fallbacks must inject an explicit null service override rather than discovering ambient Redis or other local infrastructure. Otherwise a developer's configured service can leak state across tests and create failures that CI cannot reproduce.

**Why:** The rate-limit fallback test used the process-wide Redis connection when one was available, so a local Redis instance changed the semantics of a test that was intended to exercise the in-process fallback.

**How to apply:** Give fallback-capable test doubles an explicit null override, while leaving production construction on the environment-resolving path.

Canonical route contracts should assert the current canonical URL, while separate compatibility coverage should assert that legacy aliases remain registered.

**Why:** A Globe contract retained the old heritage path after `/diaspora` became canonical, causing CI to reject the intended navigation even though the compatibility route was still available.

**How to apply:** Update navigation and deep-link expectations together when canonical routes change; keep legacy paths only in compatibility-route tests and registration.

Source contracts should read the module that owns a user-visible label or behavior
after a presentation refactor, rather than asserting an incidental string in the
page that consumes the component.

**Why:** The Messages V18 shell moved Direct and Hubs labels into the shared tab
component; the old page-level assertion failed even though the rendered behavior
was correct.

**How to apply:** When UI ownership moves, update the contract's source fixture
alongside the refactor and keep lint clean by removing obsolete source reads.