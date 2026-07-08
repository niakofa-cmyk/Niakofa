---
name: Niakofa REDIS_URL validation & audit CSV export
description: Where REDIS_URL format validation lives and the shared CSV-export sanitizer pattern for admin widgets.
---

**REDIS_URL validation** (`artifacts/api-server/src/lib/queue.ts` `parseRedisUrl`):
- Prefix check (`redis://`/`rediss://`) alone is insufficient — values with the right prefix but no real host (`redis://`, `redis://${{Redis.REDIS_URL}}`) still fail; validated with `new URL()` + a check for missing hostname or leftover `{}$` template chars.
- Production actually deploys to Railway (external), not Replit deployments — Replit's `viewEnvVars` cannot see Railway's env vars, so REDIS_URL correctness there must be verified by checking Railway's dashboard directly, not from the Replit env.

**Admin CSV exports** (`artifacts/pay-it-forward/src/pages/admin.tsx`):
- Two independent CSV export buttons exist: the generic `AuditLogTable` (Audit tab) and the Nia kill-switch audit widget. Both must use the same `csvEscapeField` sanitizer.
- `csvEscapeField` prefixes cells starting with `=`, `+`, `-`, or `@` with a leading apostrophe before quoting, to prevent CSV/Excel formula-injection when an admin opens the exported file in a spreadsheet app. Quoting alone (escaping only `"`) is not sufficient.
