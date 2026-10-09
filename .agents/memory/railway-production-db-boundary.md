---
name: Railway production database boundary
description: How to handle production database checks when the deployed Niakofa service uses Railway rather than Replit-managed production Postgres.
---

## Rule

The Replit production database query path cannot inspect Niakofa's Railway-hosted production database when the Repl has no Replit-managed production database. Do not substitute the development `DATABASE_URL` or retrieve and expose a Railway database credential just to run a preflight.

**Why:** The live API can be healthy against Railway while the Replit database tool reports that no production database exists; confusing those environments can produce false release evidence or inspect the wrong data.

**How to apply:** Run HTTP release smoke and readiness checks against the Railway deployment. For financial SQL preflights, require an operator-provided read-only Railway replica or snapshot through the approved environment/secret path, then run the release pack's queries without mutating production. Railway environment/deployment health does not prove schema or row-level audit results; its connected agent may not expose SQL execution.

The connected Railway MCP is not itself a SQL connection: its available tools expose infrastructure and an AI agent, while an existing TCP database proxy may be absent. A connection chip therefore does not establish row-level audit access; require an approved read-only query path and treat an agent usage-limit response as blocked evidence.

**Why:** The Railway connection can be healthy while the agent has no SQL capability or quota, and no proxy may exist for a direct read-only client.

**How to apply:** Check for an existing read-only proxy without creating one. If none exists and the Railway agent is unavailable, report the audit as unavailable rather than reading variables or substituting development data.

## Row-level audit access

An existing TCP proxy only proves network forwarding; it does not establish a read-only database role or a supported SQL query tool. The connected `railwayAgent` is action-capable and must not be assumed to provide SQL; it may only search documentation.

**Why:** A proxy was present, but neither it nor the Railway agent provided an approved row-level query path. Reading Railway variables to recover credentials or creating another proxy would cross the read-only boundary.

**How to apply:** For account or content audits, require an operator-provided read-only snapshot, replica, or query output. If none is available, report the filtered request-log evidence as inconclusive and do not infer row state.

## PostGIS maintenance

When Niakofa is backed by separate Railway PostgreSQL services, verify which
service `DATABASE_URL` actually references before drawing conclusions. A service
named `PostGIS` is not proof that the app uses it, and a service named `Postgres`
may still have the PostGIS extension installed. For an explicitly authorized
schema repair, use the repository's idempotent migration runner with the
operator-provided secret transiently, then verify the extension and required
`geography` columns with read-only queries. Never print, persist, or commit the
connection string.

**Why:** Railway metadata and service names do not prove the configured target
or its schema. The application can use PostGIS-backed queries with a fallback,
so the extension and schema must be checked on the actual application database.

**How to apply:** Confirm the operator-visible variable reference and run
read-only extension/schema checks against that service before claiming
production readiness or planning a repair. Keep the Haversine fallback only for
environments that intentionally lack PostGIS.

As of 2026-10-08, the operator confirmed in Railway's Variables view that the
production `zesty-ambition` service references **Postgres** for `DATABASE_URL`.
The separate **PostGIS** service is live but is not the app's configured target.
This resolves the configured target, but not the live schema or runtime query
behavior; no production SQL was run for that confirmation.

**Why:** Both Railway database services expose similarly named PostgreSQL
variables, while the connected Railway metadata omits the reference expression.
Service status and variable names alone cannot distinguish the target.

**How to apply:** Treat the operator-confirmed Postgres reference as wiring
evidence only. Use an approved read-only SQL session against that app target for
extension, geography-column, trigger, and index verification before claiming
production schema readiness.

As of 2026-10-08, Railway reports an existing active TCP proxy on the production
PostGIS service forwarding to PostgreSQL port 5432. The proxy was inspected but
not created or changed. It belongs to the separate PostGIS service, not the
app's Postgres target.

**Why:** The proxy can provide network reachability for an operator's PostgreSQL
client, but it does not prove database authorization or that the account is
read-only.

**How to apply:** Do not use the separate PostGIS proxy to inspect the app's
Postgres database. Use an approved query path for the confirmed app target.
Never create a proxy or infer read-only privileges from active status.

## Credential validation

Secret presence or secure-form confirmation does not prove that a Replit process can authenticate with the saved connection value. An operator's successful interactive login also does not validate a URI's password encoding or the value saved in Replit.

**Why:** A read-only role authenticated from the operator's prompt, while repeated Replit URI and temporary-password-file attempts still failed authentication. The secret value was intentionally inaccessible for comparison.

**How to apply:** Verify the actual Replit connection and privilege guard before querying. After repeated authentication failures, stop retrying hidden values and use an operator-run read-only query or another verified path; never inspect or print the secret to diagnose it.