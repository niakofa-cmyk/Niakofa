# Niakofa Legacy production-readiness checkpoint — 2026-08-12

## Baseline

- GitHub `origin/main` was fetched with the repository's configured GitHub
  authorization and aligned locally at `e1720a0fb6fdcdbba1ec88587b7cadf40688e67d`.
- The uploaded original-art engine patch was compared against this baseline.
  It was not reapplied because the current engine, tests, catalog, and runtime
  assets are already newer and present in `origin/main`.
- The uploaded references are preserved in
  `docs/legacy-reference/uploaded-2026-08-12/`.

## Changes in this checkpoint

1. Removed an unused `BusinessScreen` value that caused the Legacy page to fail
   repository lint.
2. Added a regression test that reads the original-art catalog and verifies
   every catalog runtime asset is shipped at its browser-resolvable path.
3. Preserved the complete session upload bundle and a live production-readiness
   screenshot for future Legacy work.

## Verified

- Legacy/app test suite: **487 passed, 0 failed**.
- Pay-it-forward Vite production build: **passed**.
- Full workspace TypeScript build/typecheck: **passed**.
- Legacy files touched in this checkpoint: **ESLint clean**.
- Built-SPA Legacy verifier against a local Vite preview:
  `/legacy/demo` and its hashed Legacy chunk: **passed**.
- Both configured workflows are running:
  - `artifacts/pay-it-forward: web` on port 5000
  - `artifacts/api-server: API Server` on port 8080
- Runtime checks: `/legacy/demo`, the original-art catalog, and an original
  character sprite all returned HTTP 200 from the web workflow.
- The live `/legacy/demo` screenshot shows the House of Mensah prologue and
  original-art character surface with no browser console errors.

## Boundaries and remaining work

- The uploaded style-gap report correctly identifies painterly/illustrated
  character and environment art as a commissioned-art direction, not a code
  substitution. The shipped original-art pixel library remains the
  license-safe prototype/runtime fallback.
- Repository-wide ESLint still reports pre-existing errors outside the Legacy
  files changed here; they were not rewritten as unrelated scope.
- The local API health endpoint reports `degraded` when the separately hosted
  Nia service is unavailable. The API server itself starts and listens
  successfully; the public Legacy demo does not require that external AI
  service to render or play.
- The deployment verifier requires a real `PRODUCTION_URL`; this checkpoint
  verified the built SPA against a local Vite preview. A published deployment
  URL must be supplied by the deployment workflow for production verification.