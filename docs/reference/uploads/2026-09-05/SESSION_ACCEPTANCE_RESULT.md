# Niakofa release evidence — 2026-09-05

This note records the verification performed against the current GitHub
`main` commit. It contains no credentials, storage state, tokens, or private
provider responses.

## Source and served-commit parity

- Repository: `https://github.com/niakofa-cmyk/Niakofa`
- GitHub `main` was independently verified through the authenticated API and
  `git pull --ff-only`; local `main` and `origin/main` matched exactly.
- Canonical live host checked: `https://niakofa.com`
- Live `/api/version` served application commit
  `fa01f88c95e9570b77fb3439d2f978c319eca9bd`; the newer GitHub commit is
  documentation-only and does not require an application redeploy.
- Live landing page returned HTTP 200 and the Niakofa SPA shell.

## Authenticated deployed acceptance

The guarded acceptance runner was executed once with an approved disposable
account. Its private storage state was created outside the repository with
0600 permissions and removed automatically after the run.

- Preflight: passed; deployment ready and commit matched.
- Diaspora non-mutating journeys: 9 passed, 1 explicitly skipped because no
  second distinct disposable account was available.
- Permitted Diaspora mutation journeys: 2 passed, 1 explicitly skipped for
  the same two-user requirement.
- County-travel journey: 1 passed, including independent county pool and
  civic-feed checks.

## Local release gates

- `verify:platform`: passed.
- `typecheck`: passed.
- `lint`: passed.
- All repository Diaspora contract suites: passed.
- Deployed-acceptance guard tests: passed.
- Production-gate tests: passed.
- Full production build: passed for the web, API, Nia, and workspace packages.

## Notes

The development API preview remains intentionally unready when its local
database schema is absent; the server stays up but pauses background workers.
This is the documented fail-closed behavior and is separate from the verified
Railway-backed live deployment.