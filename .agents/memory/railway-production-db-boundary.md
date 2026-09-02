---
name: Railway production database boundary
description: How to handle production database checks when the deployed Niakofa service uses Railway rather than Replit-managed production Postgres.
---

## Rule

The Replit production database query path cannot inspect Niakofa's Railway-hosted production database when the Repl has no Replit-managed production database. Do not substitute the development `DATABASE_URL` or retrieve and expose a Railway database credential just to run a preflight.

**Why:** The live API can be healthy against Railway while the Replit database tool reports that no production database exists; confusing those environments can produce false release evidence or inspect the wrong data.

**How to apply:** Run HTTP release smoke and readiness checks against the Railway deployment. For financial SQL preflights, require an operator-provided read-only Railway replica or snapshot through the approved environment/secret path, then run the release pack's queries without mutating production.