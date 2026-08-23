---
name: ESLint hook warning policy
description: How this monorepo handles intentional effect lifecycles while keeping lint output clean.
---

Intentional mount-only or render-synchronous effects may retain their existing lifecycle, but the exhaustive-deps exception must sit directly on the dependency line and explain why. Prefer real dependencies, stable memoized inputs, and ref snapshots whenever those preserve behavior.

**Why:** Adding a dependency can recreate browser engines, reload network listeners, or create unstable loops; suppressing broadly hides unrelated hook mistakes.

**How to apply:** Fix dependency omissions and ref cleanup warnings first. For a deliberately constrained lifecycle, use one narrowly scoped inline exception and rerun ESLint to ensure there are no unused directives.