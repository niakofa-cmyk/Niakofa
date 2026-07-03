---
name: Niakofa Railway migration hardening
description: Migration script RECOVERY_CHECKS, BASELINE_CUTOFF, railpack startCommand — critical Railway deploy config.
---

## Rules

**RECOVERY_CHECKS must use safe queries (no hard ::regtype/::regclass casts)**  
On a fresh DB, `'report_type'::regtype` throws — use `pg_type` join or `to_regtype()` instead.  
Wrap in try/catch so a failed check is non-fatal (logs a warning, skips).

**Recovery only runs on non-fresh DBs**  
Guard the RECOVERY_CHECKS loop with `if (!isFreshDb)`. On a fresh DB, nothing was baseline-marked so nothing needs to be recovered.

**BASELINE_CUTOFF = "0017_preferred_language.sql"** (not 0021)  
Reason: 0018–0021 were baseline-marked on Railway without actually being executed. The recovery block re-queues them if their effects are absent.

**railpack.json startCommand must include migrations**  
```
"startCommand": "pnpm --filter @workspace/db run migrate && node --enable-source-maps artifacts/api-server/dist/index.mjs"
```
Without the `migrate &&` prefix, Railway boots against stale schema on every deploy.  
If migrate fails (non-zero exit), `&&` prevents the server from starting — this is intentional.

**Why:** `drizzle-kit push` (old approach) requires a TTY and silently failed on Railway, leaving schema sync broken for unknown periods. Direct SQL migration via `pg` pool is always non-interactive.

## Required Railway Env Vars
Critical: `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MAPBOX_TOKEN`, `VITE_MAPBOX_TOKEN`, `INTERNAL_SECRET`, `SERVE_FRONTEND=true`, `NODE_ENV=production`, `ALLOWED_ORIGIN`.
See `RAILWAY_DEPLOY.md` for complete reference.

## Test Account Credentials
- Admin: `admin@niakofa.app` / `NiakofaAdmin2026!` (id=1, is_admin=true)
- Helper: `helper@niakofa.app` / `NiakofaHelper2026!` (id=2, helper_status=approved)
- User: `user@niakofa.app` / `NiakofaUser2026!` (id=3, standard user)
