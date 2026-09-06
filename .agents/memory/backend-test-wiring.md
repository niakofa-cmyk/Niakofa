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

The Nia service's ESM Jest suites must run through the package test script (or
with `NODE_OPTIONS=--experimental-vm-modules`); invoking Jest directly can skip
the VM module runtime and produce misleading `import.meta`/mock failures.

**Why:** Its route tests use `jest.unstable_mockModule()` and `.js` ESM import
aliases, which only behave correctly when Jest is launched with Node's VM
modules enabled.

**How to apply:** Use the package's test command for CI-equivalent validation
and avoid diagnosing direct-Jest failures as production module problems.