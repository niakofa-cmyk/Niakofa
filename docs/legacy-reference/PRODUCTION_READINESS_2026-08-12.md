# Niakofa Legacy production-readiness checkpoint — 2026-08-12

## Baseline

- Local `main` is aligned with the locally available `origin/main` object at
  `6bafeee12a828f152b080dc18a15ae1e571471d0`
  (`Legagy Demo - legacy-living-world.tsx M legacy-character-engine.test.ts M
  PRODUCTION_READINESS_2026-08-12.md M README.md M baobab_trunk.png`). A supported
  GitHub write path was not available in this session, so this is not a claim
  of an independently fetched GitHub remote.
- The uploaded original-art engine patch was compared against this baseline.
  It was not reapplied because the current engine, tests, catalog, and runtime
  assets are already newer and present in `origin/main`.
- The uploaded references are preserved in
  `docs/legacy-reference/uploaded-2026-08-12/`, including the exact current
  upload snapshot in `session-current/` with SHA-256 checksums.

## Changes in this checkpoint

1. Removed an unused `BusinessScreen` value that caused the Legacy page to fail
   repository lint.
2. Added a regression test that reads the original-art catalog and verifies
   every catalog runtime asset is shipped at its browser-resolvable path.
3. Preserved the complete session upload bundle and a live production-readiness
   screenshot for future Legacy work.
4. Shipped all 13 documented original-art world tiles under
   `artifacts/pay-it-forward/public/legacy-world-assets/tiles/`.
5. Added a responsive House of Mensah map that uses those real tile assets,
   supports arrow keys/WASD and touch-friendly compass controls, blocks
   impassable terrain, and renders the current original-art player sprite.
6. Added a regression test that reads the world-tile catalog and verifies every
   documented tile exists at its browser-resolvable runtime path.
7. Added a canonical golden-path regression test that completes the House of
   Mensah kitchen, business, mystery, world regeneration, co-op, reunion, and
   persistence flows in one journey.

## Verified

- Legacy/app test suite: **488 passed, 0 failed**.
- Pay-it-forward Vite production build: **passed**.
- Full workspace TypeScript build/typecheck: **passed**.
- The changed Legacy component and engine test compile through the full
  workspace typecheck; repository-wide ESLint still has unrelated pre-existing
  findings.
- Both configured workflows are running:
  - `artifacts/pay-it-forward: web` on port 5000
  - `artifacts/api-server: API Server` on port 8080
- Runtime checks: `/legacy/demo`, the original-art catalog, all 13 world tiles,
  and an original character sprite returned HTTP 200 from the web workflow.
- The live `/legacy/demo` screenshot shows the House of Mensah prologue, the
  playable pixel-art map, compass controls, and the original-art character
  surface with no browser console errors after both workflows were running.

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
- GitHub remains unsynced from this session: the declined GitHub integration,
  rejected provisioned credentials, and unavailable public repository path
  prevent a truthful push/fetch confirmation.
- The deployment verifier requires a real `PRODUCTION_URL`; this checkpoint
  verified the built SPA against a local Vite preview. A published deployment
  URL must be supplied by the deployment workflow for production verification.