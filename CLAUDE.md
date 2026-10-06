# Niakofa project notes

## Canonical source

- The active product source is under `artifacts/` and shared packages under
  `lib/`. `niakofa-repo/` is an archived mirror; do not edit it.
- Keep changes within the product and artifact that owns them. Do not copy
  uploaded or unlicensed reference source, assets, credentials, schemas, auth,
  or backend configuration into the product.
- Uploaded review documents belong under `docs/reference/`; keep originals
  unchanged and link to tracked copies when a review must remain available on
  GitHub.

## Safety and production boundaries

- Do not access production account state, Stripe money movement, Railway
  production databases, or existing media unless the user gives specific
  authorization for that operation.
- Never generate or replace authenticated browser state for production accounts.
- A push to GitHub `main` may trigger the configured Railway deployment. Do not
  run a separate manual deployment unless requested.
- Treat the large historical session log at
  `docs/agent/CLAUDE.md.legacy-archive` as archival context, not current
  architecture or policy. Verify current behavior in code and deployment
  configuration.

## Verification

- Use the repository-pinned package manager and the existing artifact workflows.
- Run `pnpm run lint`, `pnpm run verify:platform`, and the relevant package
  tests/typechecks for the changed areas before publishing.
- If an OpenAPI source contract changes, regenerate the server/client types in
  the same change.
- Restart only the workflows affected by code or run-command changes, then
  verify their logs and served behavior.
