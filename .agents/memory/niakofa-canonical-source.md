---
name: Niakofa Canonical Source Tree
description: Which directories are canonical vs stale/archived — critical for avoiding edits to the wrong version.
---

## Canonical (active, edit these)
| Service | Path | Workflow |
|---|---|---|
| Frontend | `artifacts/pay-it-forward/` | `artifacts/pay-it-forward: web` (port 18848) |
| API | `artifacts/api-server/` | `artifacts/api-server: API Server` |
| Mockup | `artifacts/mockup-sandbox/` | Component Preview Server |

## Archived (do NOT edit source files here)
- `niakofa-repo/` — stale historical mirror; marked with `niakofa-repo/CANONICAL_SOURCE.md`
  - `niakofa-repo/artifacts/` — stale snapshot of root `artifacts/` (differing files, not sync'd)
  - `niakofa-repo/src/` — historical app src (old session, superseded)
  - `niakofa-repo/archive/` — safe to read: Supabase prototype, old references
  - `niakofa-repo/.agents/memory/` — older session memory files (read-only historical reference)

**Why:** `niakofa-repo/` was a full working copy from a pre-monorepo session. Root workflows only activate `artifacts/*`. Editing `niakofa-repo/artifacts/` silently breaks nothing visible but diverges from canon and can confuse agents next session.

## Art & Reference Assets
- `artifacts/pay-it-forward/public/legacy-character-assets/` — character art
- `artifacts/pay-it-forward/public/legacy-environment-assets/` — environment art
- `docs/NIAKOFA_ART_BIBLE.md` — canonical art spec
