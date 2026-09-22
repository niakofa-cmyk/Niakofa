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