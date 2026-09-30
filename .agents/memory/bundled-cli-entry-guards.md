---
name: Bundled CLI entry guards
description: Why importable CLI helpers must not decide direct invocation from import.meta.url alone in a server bundle
---

An importable command-line helper must distinguish its own direct CLI invocation from the API server entrypoint, or move CLI execution into a separate entry file. Never rely solely on comparing `import.meta.url` with `process.argv[1]` when the helper is bundled into a server.

**Why:** A bundler can rewrite the imported module's URL to the server entry file. The usual URL comparison then becomes true on server startup and can run supposedly one-off storage writes before authentication or feature gates.

**How to apply:** Separate executable entrypoints where practical; if an existing CLI must also be imported, add an exact CLI filename check and verify the built server bundle and a flag-off boot before deploying.