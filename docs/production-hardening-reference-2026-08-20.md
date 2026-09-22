---
name: Production hardening reference
description: Index for the August 20, 2026 platform-hardening brief and the verified runtime boundary.
---

# Niakofa production hardening reference

The complete architecture brief is preserved at:

`attached_assets/Pasted-The-objective-should-be-More-coherent-code-I-would-targ_1787235720073.txt`

It was reviewed in full for this hardening pass. The brief's central direction is
to improve the existing platform without rewriting it:

- one identity, event, knowledge, AI, observability, navigation, media, and
  experimentation boundary;
- graceful degradation when optional services are unavailable;
- versioned platform state so an AI generation never becomes the only source
  of truth;
- production validation for routes, auth, APIs, data, deep links, refresh,
  mobile behavior, payouts, push, media, offline use, and operations.

The follow-up infrastructure brief is also preserved at:

`attached_assets/Pasted--Fortify-The-Structure-and-Infrastructure-To-Be-able-to_1787239587417.txt`

Its concrete P0 findings are now addressed: production CORS fails closed when
`ALLOWED_ORIGIN` is missing, and the Railway start script refuses to boot
services after all migration retries fail.

## Verified implementation boundary

- `artifacts/pay-it-forward/` is the canonical web application.
- `artifacts/api-server/` is the canonical API and WebSocket service.
- `lib/` contains shared database, API contract, and trust-tier packages.
- Historical source archives are not automatically promoted to runtime.

## This pass

The API startup now checks both database connectivity and the presence of the
canonical `public.help_requests` table before starting database-backed workers.
When the dependency is unavailable or migrations have not run, the HTTP server
stays available for `/healthz` and `/readiness`, while workers remain paused
instead of producing repeated background query failures.

Verified after the change:

- web workflow serves the sign-in landing screen;
- API workflow applies migrations and starts cleanly;
- route/page contract audit passes for all declared routes;
- app/AI boundary audit passes;
- API typecheck passes;
- BUG-15b/15c regression suite passes (7 tests).
