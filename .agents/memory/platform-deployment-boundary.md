---
name: Platform deployment boundary
description: Production verification must validate the Niakofa platform SPA and API contracts, not the separate Legacy RPG runtime.
---

The Niakofa deployment gate is intentionally platform-only. It should verify
the root SPA HTML, hashed entry JavaScript, PWA manifest, and API health/readiness
contracts. Legacy RPG routes, game chunks, and game asset catalogs belong to the
separate RPG repository and must not block a Niakofa platform deployment.

**Why:** The platform/RPG split is architectural, and keeping a Legacy demo
check in the main repository caused false deployment failures after the runtime
was correctly removed.

**How to apply:** When adding production smoke checks, follow platform routes
and public metadata from the built app; do not restore RPG-specific gates just
to satisfy old CI expectations.