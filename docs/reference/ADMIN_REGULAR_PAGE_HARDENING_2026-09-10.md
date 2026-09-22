# Regular Admin Page Hardening — 2026-09-10

## Scope

The regular `/admin` console remains the legacy multi-tab Admin surface. Its
Configure → System tab now consumes the same live Global Ops contract as Admin
2.0 at `/admin/operations`.

The contract is intentionally operational rather than a legacy coverage report:

- Worker health and worker registry
- WebSocket hub metrics
- Redis status
- Navigation circuit-breaker status
- Storage description
- Allowlisted system settings
- Process metadata

The removed legacy fields `summary`, `gps_health`, `regions`, and
`feature_checks` must not be reintroduced into the API or regular Admin UI.

## Verification

- Admin route inventory: PASS
- Admin coverage rows: 64
- API Admin wiring test: 4 passed
- Shared/API TypeScript composite build: PASS
- Web TypeScript check: PASS
- Web unit tests: 509 passed
- Targeted ESLint: PASS
- Web preview: served the Niakofa sign-in surface at the managed Vite port

The authenticated browser regression for the regular Admin System tab is in
`e2e/admin-2-0-live.spec.ts`. It verifies the live response fields, rejects the
legacy field names, and checks that the live Global Ops sections render.

## Environment gate

The local API workflow could not start because the configured `DATABASE_URL`
resolves to the private Railway hostname `postgis.railway.internal`, which is
not resolvable from this Replit workspace. The migration command therefore
fails closed before the API serves requests. This is an environment/network
configuration gate, not an Admin contract failure; the production acceptance
run must be repeated from an environment that can resolve the production
database host.

The Nia workflow starts its listener but reports that its optional AI worker
configuration is disabled in this workspace. No secret values are recorded
here.

## Preview reference

`screenshots/admin-landing-verification-2026-09-10.jpg` records the served
landing surface used for the visual verification pass.