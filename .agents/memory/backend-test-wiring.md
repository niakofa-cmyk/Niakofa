---
name: Backend test wiring
description: Backend Jest suites require explicit configuration and serialized execution in workspace commands.
---

The API package's backend tests must load `jest.config.mjs` explicitly and run
serialized because the ESM suites replace shared module imports with mocks.
The aggregate command also runs the root endpoint suite and the standalone
repayment-date tests, which use different runners.

**Why:** The previous package command used Jest defaults with `--passWithNoTests`,
so CI could report success without running backend tests; workspace argument
forwarding also made focused Jest filters unreliable.

**How to apply:** Keep the package test command fail-closed (no
`--passWithNoTests`), use `--runInBand`, and invoke focused suites from the
API package directory with the Jest config loaded directly.

Shared Drizzle mocks must also model the query shape under test: include SQL
helpers such as `sql.join`, and make terminal methods chainable when the
production query continues with methods such as `offset`.

**Why:** The county-scope regression used a valid production query shape that
the older mock could not execute, causing a false 500 in the test harness.

**How to apply:** When adding route coverage, mirror every intermediate
builder method and configure terminal behavior per call rather than making one
global mock return value serve incompatible query shapes.

The API and Nia ESM Jest suites must run through their package test scripts (or
with Node's `--experimental-vm-modules` flag); invoking the Jest binary directly
can skip the VM module runtime and produce misleading auth/import/mock failures.

**Why:** Its route tests use `jest.unstable_mockModule()` and `.js` ESM import
aliases, which only behave correctly when Jest is launched with Node's VM
modules enabled.

**How to apply:** Use the package's test command for CI-equivalent validation,
or launch focused suites from the package directory with the same VM-module
flag and explicit Jest config. Avoid diagnosing direct-Jest failures as
production module problems.

Test setup must forcibly pin secret-backed boundaries before importing routes:
database, internal/session secrets, `NIA_SERVICE_URL`, and both Redis variable
names (`REDIS_URL` and `REDIS_URLS`). Nullish defaults are not sufficient when
the workspace injects production values.

**Why:** Configured workflow secrets can redirect mocked suites to production
Postgres or Redis, or make in-process service-auth checks depend on deployed
configuration. A leftover Redis connection also keeps Jest alive after tests
pass.

**How to apply:** Override the full boundary in `jest.setup.ts`; restore
per-test overrides explicitly when a suite needs them. Mock API-to-service
clients such as Nia in route unit tests instead of calling a running workflow.

Database-backed acceptance tests need their own migrated, disposable local
database, not the workspace's default development database. The Jest test
boundary must point explicitly at that isolated database; a shell-level
database override alone is insufficient.

**Why:** The safe Jest defaults intentionally replace ambient database
connections, while the workspace's default database may contain unrelated
data. Confusing the two produces either a connection failure or fixture
mutations in the wrong environment.

**How to apply:** Provision an isolated test-named database in the local
disposable PostgreSQL cluster, migrate it, pass its connection through the
test-only override, and keep exact-ID fixture cleanup. Never use a production
connection or assume a passing policy fixture certifies production media.