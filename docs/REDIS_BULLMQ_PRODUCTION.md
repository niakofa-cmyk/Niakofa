# Niakofa Redis / BullMQ Production Runbook

## Required production configuration

Set these environment variables in the API service:

```env
NODE_ENV=production
REDIS_URL=rediss://<user>:<password>@<host>:<port>
```

Do not commit the URL or place it in source control. Prefer the Redis
provider's private/internal TLS URL when the API and Redis share a private
network.

Production startup fails closed when `REDIS_URL` is absent or malformed and
waits for both Redis connection profiles to become ready before accepting
traffic.

## Redis requirements

BullMQ stores durable job state in Redis. The Redis service should:

- enable persistence (AOF is recommended for BullMQ workloads)
- use `maxmemory-policy=noeviction`
- use TLS when supported by the provider
- have backups/restore appropriate to the payment workload
- monitor memory, connections, latency, and rejected commands

Never configure BullMQ's Redis instance as an ordinary cache that is allowed
to evict queue keys.

## Connection behavior

Niakofa uses two Redis connection profiles:

- **Worker connection:** `maxRetriesPerRequest=null` and exponential reconnect.
  Workers wait through transient Redis outages and resume when Redis returns.
- **Queue/producer connection:** bounded retries plus
  `enableOfflineQueue=false`. HTTP requests fail quickly instead of
  accumulating an unbounded offline command queue.

This follows BullMQ's production guidance for separating producer and worker
retry behavior.

## Graceful shutdown

On `SIGTERM` / `SIGINT`:

1. stop accepting new HTTP traffic;
2. call `Worker.close()` so active jobs can finish and no new jobs are fetched;
3. close Redis connections;
4. drain PostgreSQL;
5. exit.

The BullMQ worker grace period is 30 seconds, and the outer process timeout
exceeds that grace period.

## Deployment topology

The preferred production topology is:

```text
Load Balancer -> Niakofa API + BullMQ -> Durable Redis (noeviction + AOF)
                                      -> PostgreSQL
```

For higher scale, move BullMQ workers into a separate worker service using the
same queue names and Redis URL. The API should then produce jobs while the
worker service consumes them.

## Queue safety

Money-moving retry jobs use stable job IDs:

- `payout-<request_id>`
- `cashout-<cashout_id>`

This prevents duplicate retry jobs from repeated HTTP requests for the same
financial record. The database remains the source of truth for payment and
ledger state; BullMQ is the durable asynchronous delivery/retry mechanism.

## Health/readiness

In production, `/readiness` reports Redis as required and only becomes ready
after the Redis connection reaches the `ready` state. A configured but
disconnected Redis instance is not reported as healthy.

## Failure tests before launch

Run these tests against a staging Redis instance:

1. API starts with a valid Redis URL.
2. API refuses production startup without Redis.
3. API refuses a malformed Redis URL.
4. Redis is restarted while a worker is idle; the worker reconnects.
5. Redis is interrupted while a job is active; the job is not silently lost.
6. Send `SIGTERM` during an active job; the job finishes or is recoverable.
7. Submit the same payout retry twice; only one BullMQ job exists.
8. Submit the same cashout retry twice; only one BullMQ job exists.
9. Redis reaches its configured memory limit; queue keys are not evicted.
10. Failed jobs remain inspectable and can be manually retried.

`REDIS_URL` is a secret. Never paste it into source code, GitHub issues,
screenshots, or chat.