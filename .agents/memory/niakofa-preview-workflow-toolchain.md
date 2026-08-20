---
name: Niakofa preview workflow toolchain
description: Environment-specific rule for starting the managed web and API previews without pnpm bootstrap races.
---

Managed preview workflows should invoke the installed artifact binaries directly
instead of running workspace scripts through a different system pnpm version.

**Why:** the workspace pins pnpm 11 while some managed environments provide
pnpm 10; startup then repeatedly attempts a package-manager handoff, can race
other workflows while rebuilding `node_modules`, and prevents either service
from reaching its port.

**How to apply:** install dependencies once before starting workflows. Use the
package-local Vite binary for the web preview and build/launch the API directly
from its artifact. Keep Railway's `scripts/start.sh` as the production entry
point because it owns migrations and service supervision.