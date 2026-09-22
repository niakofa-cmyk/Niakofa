# Fix: "Too many requests from this address…"

## Updated repo behavior (current main)

| Layer | Behavior |
|-------|----------|
| `apiTrafficLimiter` | After `parseAuth`: **2000 / 15 min per userId** if authenticated; **300 / 15 min per IP** if not |
| `generalApiLimiter` | **No-op** (compat only — does not double-count) |
| Redis | Used when queue Redis connection exists; fails open to memory on Redis errors |
| Auth | Still tight: **10 / 15 min per IP** on login routes |
| Media token | `circleMediaTokenLimiter` **30 / 5 min** user-keyed |

If you still see the exact string *"Too many requests from this address…"*, it is from `apiTrafficLimiter` (or an older deploy still running the pre-hardening global IP limiter).

## What to do operationally

1. **Redeploy** API so `rate-limit.hardened.ts` + Redis store are live.
2. Confirm `REDIS_URL` is set in production (shared counters across instances).
3. Frontend: use backoff on 429 (`fetchWithBackoff` / Retry-After) — do not tight-loop login.
4. Do **not** remove rate limiting for millions of users; keep user-keyed generous reads + tight auth/payments/AI.

## Not fixed by raising IP limit alone

Shared NAT (apartments, cellular CGNAT) needs **userId** keys — already the authenticated model in current code.
