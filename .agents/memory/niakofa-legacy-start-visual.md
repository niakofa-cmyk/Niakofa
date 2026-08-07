---
name: Niakofa Legacy start visual
description: Asset and runtime verification decisions for the Living Family Legacy start surface.
---

# Niakofa Legacy start visual

The Living Family Legacy reference image used by the start surface is the same
byte-identical design already committed as the Aug 2 game-modes overview. Keep
the frontend-facing copy in its public asset directory rather than importing
from `attached_assets`, because Vite's filesystem allowlist does not include
that upload directory in dev or production builds.

**Why:** The uploaded source can be transient in a Replit workspace, while the
committed reference is stable and preserves the requested visual exactly.

**How to apply:** Keep the image as a visual reference layer and use real
family-vault counts and journey routes for the interactive state. Do not turn
the reference screenshot into a static replacement for the RPG UI.

The Railway deploy probe is `/api/healthz`; it returned HTTP 200 with a
connected database during the Aug 5, 2026 verification. `/api/health` is not
the registered public probe in the current route map and should not be used as
the deployment health check without a separate API contract decision.

**Why:** Treating the wrong health path as a deployment failure can lead to
unrelated changes to a healthy Legacy deployment.

**How to apply:** Use `/api/healthz` for Railway health checks and investigate
`/api/health` separately if a Nia-service health contract is intentionally
needed.