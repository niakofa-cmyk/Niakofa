---
name: Node runtime in local shell
description: Accessing the installed Node module when non-interactive shell commands do not inherit its PATH.
---

When a Node module is enabled but `node` is missing from the local shell’s PATH, locate the compatible Node executable under `/nix/store` and prepend its `bin` directory only for the validation command.

**Why:** The non-interactive shell can have a narrower PATH than managed workflows, even while the Node module is installed.

**How to apply:** Prefer the project’s configured Node major, set a command-scoped PATH, and avoid changing project or global runtime configuration just to run a check.