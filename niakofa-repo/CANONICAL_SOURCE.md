# ⚠️ ARCHIVED MIRROR — NOT THE CANONICAL SOURCE

**This directory (`niakofa-repo/`) is a stale historical mirror of the Niakofa codebase.**

## Canonical Source Tree

All active development happens in the **workspace root `artifacts/` directory**:

| Service | Canonical Path | Workflow |
|---|---|---|
| Frontend (Web App) | `artifacts/pay-it-forward/` | `artifacts/pay-it-forward: web` |
| API Server | `artifacts/api-server/` | `artifacts/api-server: API Server` |
| Mockup Sandbox | `artifacts/mockup-sandbox/` | `artifacts/mockup-sandbox: Component Preview Server` |

## Why This Directory Exists

`niakofa-repo/` was a full working copy from an earlier development session
(pre-monorepo migration). The root `artifacts/` structure is the result of
migrating to the Replit multi-artifact workspace pattern.

## What Is Safe to Read Here

- `niakofa-repo/archive/` — historical prototypes (Supabase prototype, etc.)
- `niakofa-repo/docs/` — older design documentation (may be superseded)
- `niakofa-repo/.agents/memory/` — older session memory (superseded by root `.agents/memory/`)

## What Is NOT Safe to Edit Here

Everything under `niakofa-repo/artifacts/` is a **stale snapshot** of the
canonical source at `artifacts/`. Edits here will be overwritten or cause
merge conflicts and will NOT affect the running application.

## Ownership Declaration

**Primary canonical source: `artifacts/pay-it-forward/src/`**
**Primary canonical API: `artifacts/api-server/src/`**
**Art assets: `artifacts/pay-it-forward/public/`**
**Reference docs: `docs/` (workspace root)**

Last confirmed: 2026-08-14
Confirmed by: Replit Agent (main session)
