---
name: Workspace validation
description: Practical constraints for validating the standalone RPG in this Replit workspace.
---

Use Corepack's pinned pnpm version for workspace installs and run package-local binaries when validating an app. Replit's webview requires a port-5000 workflow, while the RPG's package dev script intentionally remains on port 5174 for its standalone contract.

**Why:** The ambient pnpm shim attempted an environment-specific self-prepare and the package script's fixed port overrode workflow arguments; both obscured otherwise healthy RPG validation.

**How to apply:** Install with `corepack pnpm`; use the RPG-local Vite binary for the Replit preview workflow and the package script when checking the documented 5174 dev command.