---
name: Platform deployment boundary
description: Production verification must validate the Niakofa platform SPA and API contracts, not retired gameplay artifacts.
---

The Niakofa deployment gate is intentionally platform-only. It should verify
the root SPA HTML, hashed entry JavaScript, PWA manifest, and API health/readiness
contracts. Retired gameplay routes, chunks, and asset catalogs must not block a
Niakofa platform deployment.

**Why:** Keeping a retired demo check in the main repository caused false
deployment failures after that runtime was removed.

**How to apply:** When adding production smoke checks, follow platform routes
and public metadata from the built app; do not restore retired-gameplay gates
just to satisfy old CI expectations.