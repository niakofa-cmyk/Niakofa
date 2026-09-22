# Fix: “Too many requests from this address”

Authenticated API traffic is user-scoped at a generous limit; anonymous
traffic remains IP-scoped. Redis provides shared counters when configured, and
the store fails open to its bounded memory fallback if Redis is unavailable.

Auth routes remain intentionally tighter, and media-token requests have their
own user-aware limit. Do not remove protection or solve shared-NAT problems by
raising a global IP limit.

If production still shows the legacy address-based message during ordinary
authenticated SPA traffic, redeploy the current API and confirm `REDIS_URL` is
available. Clients should honor `Retry-After` and back off rather than
tight-looping.