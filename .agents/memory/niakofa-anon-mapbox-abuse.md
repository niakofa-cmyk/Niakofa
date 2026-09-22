---
name: Niakofa anonymous endpoints calling paid third-party APIs
description: Unauthenticated routes that internally call a metered third-party API (Mapbox, etc.) need their own rate limit and a fail-fast guard for a missing token.
---
- An unauthenticated route (allowed for pre-signup discovery) that internally calls a metered geocoding/mapping API on certain inputs is a quota-drain vector for scripted callers — it must carry its own rate limiter even though `requireAuth` isn't available as the gate. Auth and rate-limiting are separate concerns here.
- The client wrapping that external call should also short-circuit and fail fast (return null/error immediately) if its required API token is unset, rather than firing a doomed request — avoids latency and log noise on misconfiguration.
- **How to apply:** any new unauthenticated route added later that calls a paid/metered external API must get this same treatment (explicit rate limiter + fail-fast token check) as part of the initial implementation, not as an afterthought.
