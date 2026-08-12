# Niakofa Legacy production-readiness checkpoint — 2026-08-12

## Baseline

- The workspace baseline is the locally available `origin/main` object at
  `56d4fefb` (`Legacy Living World`), with the current session's upload bundle
  preserved below. A supported GitHub write path was not available during the
  baseline import, so this is not a claim of an independently fetched GitHub
  remote.
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
8. Added visible, stable map landmarks for each restored artifact and a
   regenerated-world discovery panel, so world regeneration changes the
   playable surface instead of only changing state metadata.
9. Made the public demo progress indicator cover all 14 phases, exposed its
   current step through the progressbar accessibility contract, and named the
   back/reset controls for keyboard and assistive-technology users.
10. Extended the deployment verifier to fetch the original-art catalog and
    validate that all documented character layers and world tiles are served as
    PNGs from the built SPA.

## Verified

- Legacy/app test suite: **489 passed, 0 failed**.
- Pay-it-forward Vite production build: **passed**.
- Full workspace TypeScript build/typecheck: **passed**.
- The changed Legacy component and engine test compile through the full
  workspace typecheck; repository-wide ESLint still has unrelated pre-existing
  findings.
- Both configured workflows are running:
  - `artifacts/pay-it-forward: web` on port 5000
  - `artifacts/api-server: API Server` on port 8080
- Built-SPA deployment verification: `/legacy/demo` and its lazy chunk loaded
  successfully from a local Vite preview; all **55/55** documented original-art
  assets (42 character layers + 13 world tiles) returned HTTP 200 with
  `image/png` content types.
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