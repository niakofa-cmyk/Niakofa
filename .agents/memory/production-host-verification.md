---
name: Production host verification
description: How to distinguish the active Niakofa production host from stale Railway service domains.
---

Always verify the canonical public domain and its served commit before treating a Railway hostname as production. A stale service hostname can return Railway's fallback 404 while the canonical domain is healthy and serving the current revision.

**Why:** Railway service URLs can outlive or lose their application binding, so a historical or environment-emitted hostname is not reliable evidence of the currently served deployment.

**How to apply:** Use the deployment-configured canonical URL for health, scoped readiness, and visual checks; compare its reported commit with local and origin/main. Treat a Railway fallback 404 as a stale-host signal, not an application regression, unless the canonical URL also fails.

**Why:** In this project, Railway has auto-deployed documentation-only commits even when the GitHub deployment-verification workflow excluded those paths. Application startup can also initialize the database before reporting that no migration files are pending.

**How to apply:** Keep workflow path filters aligned with Railway's observed watch behavior. For a no-deploy or no-database-change task, do not push any commit to `main`. If a push has already triggered a deployment, verify the deployed commit and inspect startup logs; “no new migrations” does not prove that startup made no database writes.

A live Railway service-variable update can redeploy the currently configured source revision rather than the revision that was serving immediately before the change. Treat a variable change that triggers deployment as a code-release boundary: verify the resulting source SHA and readiness before production writes.

**Why:** During media certification, changing the V21 variable deployed a newer `main` revision, so the served SHA changed even though the requested change was only a flag.

**How to apply:** After a production variable update, wait for the deployment to settle, compare the canonical host's `/api/version` with the intended source revision, recheck readiness, and regenerate revision-bound browser states before writing.