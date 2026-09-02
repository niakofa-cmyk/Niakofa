# Controlled extraction reference packet

This packet preserves the uploaded migration-status note and records the
repository boundary used during the September 2026 Niakofa review.

## Evidence captured

- `controlled-extraction-note.txt` is the migration-status note captured during
  the review and preserved for repository continuity.
- `../../../../screenshots/niakofa-baseline-2026-09-02.jpg` is the verified
  landing-page capture from the canonical `artifacts/pay-it-forward` app.
- `docs/LEGACY_EXTRACTION.md` remains the authoritative platform/RPG contract.
- The checked-in RPG archives under `reference/niakofa-legacy-rpg/uploads/` and
  `docs/legacy-mode-reference-bundle/source-material/` remain archive-only
  provenance material; they are not extracted into the live platform runtime.

## Classification inventory

The classification is path-based so it remains reviewable without duplicating
the standalone repository or reintroducing deleted historical source.

### Move to `niakofa-cmyk/niakofa-legacy-rpg`

- RPG-only runtime, game-loop, map, collision, movement, combat, NPC, quest,
  simulation, scene, and game-specific AI source.
- RPG-only design notes, generator references, source text, and archived
  Supabase RPG prototype material already transferred under the standalone
  repository's `docs/from-niakofa/` and
  `archive/legacy-mode-supabase-prototype-*` paths.
- The standalone repository's migration manifest and checksums are the source
  of truth for transfer completeness. This checkout does not recreate those
  transferred paths.

### Keep in Niakofa as platform infrastructure

- `artifacts/api-server/src/routes/legacy-*` and their supporting services.
- Legacy launch-ticket/session boundary and compatibility routes.
- Family Vault, family tree, interviews, media persistence, and their database
  schemas/migrations.
- Authentication, accounts, approval, trust and safety, Community Pool,
  Stripe, notifications, Mapbox, WebSocket, workers, and release checks.
- `.agents/memory/`, `replit.md`, `CLAUDE.md`, and the platform extraction
  contract.
- The canonical React/Vite platform in `artifacts/pay-it-forward/`, including
  mutual aid, community, Circles, Nia entry points, and family-history UI.

### Archive-only; do not promote to active source

- Unresolved or provenance-uncleared binary uploads and checked-in ZIPs.
- Historical screenshots, generated HTML exports, old session transcripts,
  duplicate upload snapshots, and stale mirrors under `niakofa-repo/`.
- Any RPG asset whose license/provenance has not passed the existing
  `release-validate` and asset-boundary checks.

## Safety rules

1. Do not delete remaining platform API, database, authentication, family/Vault,
   release, or memory files as part of RPG extraction.
2. Do not copy the standalone RPG runtime back into the platform checkout.
3. Scan textual material and archives for credential-shaped values before any
   future GitHub synchronization; secrets belong in the workspace secret store.
4. Treat a successful local commit as insufficient evidence of GitHub landing:
   fetch `origin/main` and compare the remote ref and tree independently.

This document describes the current boundary and acceptance evidence; it is not
permission to redirect `/legacy/world` before the gates in
`docs/LEGACY_EXTRACTION.md` pass.