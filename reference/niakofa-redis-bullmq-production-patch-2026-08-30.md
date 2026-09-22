# Redis / BullMQ Production Hardening — 2026-08-30

## Hardening covered

- Separate Redis connection policies for queue producers and workers.
- Worker connections use infinite request retries and exponential reconnect.
- Queue producers use bounded retries and disable ioredis offline queueing.
- Production startup fails closed when `REDIS_URL` is absent or malformed.
- Production startup waits for Redis readiness before accepting traffic.
- Production readiness reports Redis as required and checks connection state.
- Graceful shutdown closes BullMQ workers before Redis and PostgreSQL.
- Stable payout/cashout BullMQ job IDs prevent duplicate retries for one
  financial record.
- Redis configuration regression coverage and an operational runbook are
  included.

## Operational boundary

The database remains the source of truth for payment and ledger state. Redis
provides durable asynchronous delivery and retry behavior. Production Redis
must use persistence, TLS where supported, monitoring, backups, and
`noeviction`; provider credentials must stay in environment secrets rather
than source control or documentation.

Staging should exercise Redis restart/reconnect, active-job interruption,
graceful termination, duplicate retry submission, memory pressure, and manual
failed-job recovery before production launch.