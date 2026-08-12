# Niakofa Legacy end-to-end audit — 2026-08-12

This is the current checkpoint for the Legacy RPG work in this repository. It
supersedes stale session notes that predate the current synced `main` commit.

## Repository and reference integrity

- The audit began from the synchronized `main` checkpoint
  `d106e4552d4e53ff6119432e0bddf14f9360982d`; the final checkpoint hash is
  verified after the changes below are committed.
- The uploaded Legacy source material remains preserved under
  `docs/legacy-reference/uploaded-2026-08-12/`.
- The current upload checksums and license boundary are recorded in
  `docs/legacy-reference/uploaded-2026-08-12/session-current/MANIFEST.md`.
- Generator archives remain reference-only until their upstream license is
  reviewed. The shipped demo uses the original-art runtime library.

## Verified application surfaces

- Public demo: `/legacy/demo`
  - House of Mensah playable map
  - Arrow/WASD and touch movement
  - blocked terrain
  - deterministic character sprite rendering
  - restored-memory landmarks
  - regenerated-world layout
  - co-op, reunion, mystery, kitchen, and persistence flow
- Authenticated Legacy hub: `/legacy`
  - route renders without browser console errors in the local preview
  - entry point remains separate from the public no-login demo
- Interview quest: `/legacy/interview-quest`
  - audio and browser video capture
  - consent gate
  - transcript fallback
  - extraction result and world-regeneration handoff

## Regression and runtime verification

- Full pay-it-forward test suite: **492 passed, 0 failed**.
- Full workspace TypeScript check: **passed**.
- Pay-it-forward production build: **passed**.
- API server workflow: listening on port 8080.
- Web workflow: serving on port 5000.
- `/legacy` and `/legacy/demo` screenshots: rendered successfully with no
  browser console errors.
- Direct public GitHub check with `git ls-remote` is repeated after the final
  checkpoint so `main` can be compared against the finished local `HEAD`.

## Fixes closed in this edition

1. Restored memory markers are now discoverable on the regenerated map and
   announce their description through an accessible live status region.
2. Interview submission validates/transcribes before creating a server quest, so
   an incomplete transcript does not create an orphan quest.
3. Interview retries reuse the existing quest ID instead of creating duplicate
   quests after a submit or media-storage retry.
4. Starting another interview clears the prior quest ID.
5. The exact landmark lookup and public demo discovery contract are covered by
   regression tests.

## Deliberate remaining boundaries

- Painterly commissioned art is a future art-production track; code does not
  substitute unlicensed third-party artwork.
- Offline/SMS onboarding and notification delivery remain platform-level
  follow-up work rather than being silently mocked in the RPG.
- Production deployment verification still requires a published production URL;
  local workflow verification is not presented as production verification.