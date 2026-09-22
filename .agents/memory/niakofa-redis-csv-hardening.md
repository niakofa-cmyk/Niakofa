---
name: Niakofa REDIS_URL validation & audit CSV export
description: Lessons on validating REDIS_URL format and sanitizing admin CSV exports.
---

**REDIS_URL validation:** a `redis://`/`rediss://` prefix check alone is not enough — an unresolved template placeholder (e.g. `${{Redis.REDIS_URL}}`) or a missing hostname can still pass it. Validate structurally with `new URL()`, and only reject actual unresolved-template syntax (`${...}` / `${{...}}`) — do not reject on a bare `$` character, since `$` is legal in Redis userinfo credentials and banning it produces false-negative rejections of valid provider URLs.
**Why:** an earlier hardening pass banned any `$` in the URL, which would have silently disabled BullMQ queues (reminders/retries) for any real-world Redis credential containing `$`.

**Production visibility gap:** this project's actual production deploy runs on Railway, not Replit Deployments — Replit's env var tools cannot see Railway's real environment, so REDIS_URL correctness there must be confirmed via the Railway dashboard, not assumed from a clean Replit check.

**Admin CSV exports:** any CSV export of admin/audit data needs a formula-injection-safe cell sanitizer (prefix cells starting with `=+-@` with a leading apostrophe before quoting) — plain quote-escaping is not sufficient protection against spreadsheet formula execution.
