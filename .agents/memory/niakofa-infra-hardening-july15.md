---
name: Niakofa infra hardening July 15 2026
description: Full list of production-quality backend and frontend improvements made in the July 14-15 session — useful if a future session continues this track.
---

## Backend infrastructure added (api-server)

| What | Where | Notes |
|---|---|---|
| unhandledRejection + uncaughtException handlers | `src/index.ts` | log + no-exit |
| keepAliveTimeout=65s, headersTimeout=66s | `src/index.ts` | prevents Railway LB 502 race |
| Gzip compression | `src/app.ts` | `compression` pkg, 1kb threshold |
| X-Request-ID response header | `src/app.ts` | echoes pinoHttp req.id |
| Structured error handler `{error,code,requestId}` | `src/app.ts` | 5xx messages sanitized |
| DB retry wrapper | `src/lib/db-retry.ts` | exponential backoff + ±20% jitter, retryable PG codes |
| 30s request timeout middleware | `src/middlewares/timeout.ts` | SSE-safe (headersSent guard) |
| 15s AbortController on Anthropic calls | `src/routes/checkin.ts` | prevents API hang |
| 60s analytics cache | `src/routes/admin-analytics.ts` | Redis-or-memory, ANALYTICS_CACHE_KEY |

**Why:** Production API servers (Railway) need keepAlive > LB timeout, hard request timeouts, and gzip. Without them, stalled queries starve workers and the LB returns 502s on rolling restarts.

## Frontend flash-empty fixes

All use `if (loading && !hasLoadedRef.current)` or `if (loading && !data)` instead of bare `if (loading)`, so stale data stays visible during re-fetches.

Files fixed: admin.tsx (10+ components), civic-needs.tsx, map.tsx, profile.tsx, county-impact.tsx.

**How to apply:** Any new component that fetches on mount should follow the hasLoadedRef pattern. Use `if (loading && items.length === 0)` in JSX (not bare `if (loading)`) so the spinner only blocks on genuinely empty first-load, not refreshes.

## GitHub push status

Local branch `main` is ahead of `origin/main` (github.com/niakofa-cmyk/Niakofa). `gitPush` returns `PUSH_REJECTED` — the Replit account is not authorized for `niakofa-cmyk`. User must connect GitHub account via Replit Git pane first.
