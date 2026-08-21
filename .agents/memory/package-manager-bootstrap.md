---
name: Package manager bootstrap
description: The workspace pnpm shim may fail while bootstrapping the packageManager-declared version under constrained process resources.
---

When dependency installation fails inside this environment with repeated pnpm self-bootstrap aborts, a temporary local package.json packageManager override to the installed pnpm 10 runtime allows frozen-lockfile installation and validation. Restore the declared packageManager before committing.

**Why:** The project declares pnpm 11, but the environment-provided shim can repeatedly abort while attempting to bootstrap it even though the lockfile is valid.

**How to apply:** Use the temporary override only for local install/check commands; never commit the override or use it as a project dependency decision.