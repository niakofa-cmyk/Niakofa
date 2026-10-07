---
name: Node runtime in local shell
description: Accessing the installed Node module when non-interactive shell commands do not inherit its PATH.
---

When a Node module is enabled but `node` is missing from the local shell’s PATH, locate the compatible Node executable under `/nix/store` and prepend its `bin` directory only for the validation command.

**Why:** The non-interactive shell can have a narrower PATH than managed workflows, even while the Node module is installed.

**How to apply:** Prefer the project’s configured Node major, set a command-scoped PATH, and avoid changing project or global runtime configuration just to run a check.

The workspace shell can expose Node 22 even when this repository specifies Node 24 and CI uses Node 24. A successful build under Node 22 does not establish Node 24 parity.

**Why:** Validation can silently run on a different runtime than the project's declared and CI runtime.

**How to apply:** Check `node --version` before validation; use an already-installed Node 24 binary when available, otherwise report the runtime mismatch instead of changing toolchain configuration implicitly.
