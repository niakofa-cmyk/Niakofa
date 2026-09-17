# Niakofa production release evidence — 2026-09-17

This document records the production-readiness evidence for the canonical Niakofa
application. The canonical source is `artifacts/`; `niakofa-repo/` is an archived
mirror and is not a source of truth.

## Deployed release

- Canonical host: `https://niakofa.com`
- Railway service: `zesty-ambition` in the `precious-abundance` production environment
- Served commit: `4c05c8a3c5851625cd2fd9e198716c824dc0ba66`
- Local `main` and GitHub `main`: independently confirmed equal to the served release

## Production health evidence

The following checks passed on both the canonical host and the generated Railway
host. Each response reported the served commit above.

| Endpoint | Result |
| --- | --- |
| `/api/healthz` | HTTP 200; database connected |
| `/api/readiness` | HTTP 200; `ready: true` |
| `/api/readiness?scope=circles,payments` | HTTP 200; database/schema, Redis, LiveKit, and Stripe ready |
| `/api/version` | HTTP 200 |
| `/api/health` | HTTP 200; co-located Nia available |

Railway deployment logs also showed completed migrations, Nia listening on the
co-located service port, Redis ready, workers started, and a successful healthcheck.

## Production configuration repair

The production service was configured with the co-located Nia boundary:

`NIA_SERVICE_URL=http://localhost:3001`

That repair resolved the initial compatibility health failure and triggered a
successful redeploy. No application source change was required for this repair.

## Local verification

- TypeScript project build: passed
- Pay-it-forward Vite production build: passed
- Diaspora V9 source tests: 3 passed
- Production/release contract tests: 15 passed
- API lifecycle integration suite: 23 passed using the package-local native-ESM
  Jest runner

The API suite must be run with the package-local Jest entrypoint and
`--experimental-vm-modules`; using the root Jest wrapper can bypass the ESM mock
registration and produce false `mockReset is not a function` failures.

## Visual reference

- [Production unauthenticated Diaspora capture](../screenshots/production-diaspora-2026-09-17.png)
- [Diaspora V9 consolidation reference](./niakofa-diaspora-v9-globe-consolidation-2026-09-17.md)
- [Existing Diaspora visual reference package](./niakofa-diaspora-globe-visual-system-2026-09-15/README.md)

The saved capture intentionally shows the sign-in boundary. It is not an
authenticated product-flow certification.

## Authenticated Globe-to-Hub gate

The authenticated browser acceptance flow remains **not certified** in this
environment because no approved disposable Playwright storage state was available.
The acceptance runner correctly requires an approved, distinct authenticated
state and explicit disposable-account approval; no credential-bearing state was
created, copied, logged, or committed.

The required browser journey is:

1. Open `/diaspora` while authenticated.
2. Select a Globe Hub.
3. Choose **Message Hub**.
4. Confirm navigation to `/diaspora/messages?sourceHub=<selected-hub>`.
5. Confirm the selected source Hub remains visible and the server-side approved
   membership boundary is enforced.

No PASS is claimed for that gate until an approved disposable state is supplied
through the existing acceptance workflow.