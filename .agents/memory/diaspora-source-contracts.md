---
name: Diaspora source contracts
description: Keep source-level checks aligned with canonical Globe and Diaspora API migrations.
---

Source-contract tests must assert the canonical route and the current component that owns the behavior, not a retired endpoint or former parent component.

**Why:** The Globe migrated from the old Hub-list route to the aggregate village-pulse response so Hub counts, live presence, stories, and activity share one snapshot; a later Community request moved into its composer component, and the stale parent-file assertion failed CI even though the running app was correct.

**How to apply:** When changing a Diaspora route consumer or moving behavior between components, update the source contract in the same commit, then run `pnpm run test:diaspora` before publishing.

Canonical Globe source contracts may also assert user-visible geography labels literally.

**Why:** Moving shared Hub semantics into a helper can preserve runtime behavior while breaking the repository's compatibility checks if the canonical component no longer contains the established label.

**How to apply:** Keep required legacy semantic copy in the canonical Globe source, even when display-name and resolution logic are shared.