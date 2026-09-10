# Niakofa Spirals — Production Checkpoint

Date: 2026-09-10

## Verified repository state

- `main` after this checkpoint: `a11c2a3a5e4b805bd85bce659344e5258412f472`
- Canonical user-facing feature: **Niakofa Spirals**
- Canonical public paths: `/audio-spirals`, `/audio-spiral/:id`
- Circle-era API/storage identifiers remain compatibility internals.
- Spirals discovery and Host Signal use the shared Map Locator location contract; the Spiral page does not use the legacy `getFreshCircleStartLocation()` browser-GPS path.
- Active discovery remains restricted to authoritative, geometry-verified neighborhood Spirals.
- Nia remains a separate service boundary and must not block core Spiral availability.

## Root cause / risk confirmed

The current production visibility contract intentionally hides neighborhood Spirals until the corresponding `city_neighborhoods` row is both `verified` and `geometry_verified`, non-generated, and currently effective. Therefore an environment with no promoted Fort Worth boundary can correctly return no discoverable Spirals even when Spiral compatibility rows exist.

The first-request provisioning race is mitigated by migration `0133_neighborhood_spiral_provisioning.sql`, which backfills Spiral rows and creates a trigger for newly inserted neighborhoods. The normal GET path remains non-blocking and schedules provisioning with cooldown/error logging.

## Admin lifecycle correction

`e2e/admin-2-0-live.spec.ts` was corrected so the gated lifecycle:

1. selects an actual Fort Worth pending row before capturing its name;
2. accepts the browser confirmation for Verify Geometry;
3. accepts the browser confirmation for Promote → Host Signal;
4. verifies the promoted row in GPS Active;
5. revokes the disposable production row through the documented `PATCH /api/admin/city-neighborhoods/:id` contract and asserts `verified=false` and `geometry_verified=false`.

This closes the test regression that previously stopped at Verify Geometry and could also select an already-partially-transitioned row.

## Reference material

The 2026-09-05/09-10 Spirals reference documents already stored under `docs/reference/uploads/` remain the source of truth for product language, Map Locator architecture, geometry lifecycle, and acceptance requirements. The historical `Niakofa-main (64).zip` was inspected as an older repository/reference snapshot; it predates the current coherent Spirals implementation and therefore is treated as historical evidence, not as a source to overwrite current main.

## Deployment verification status

GitHub `main` now points to the checkpoint commit above. GitHub currently reports no workflow runs/statuses attached to that commit, so CI is **not claimed green** from this checkpoint alone.

Railway production status could not be independently queried in this session because the Railway connector was unavailable. No Railway production mutation or deployment is claimed from this checkpoint.

## Next acceptance gate

Before declaring Spirals production-certified, run the authenticated deployed acceptance against the actual Railway origin:

- `/api/readiness` ready;
- fresh Fort Worth Map Locator fix resolves to the correct city/neighborhood;
- `/api/audio-spirals` returns the active verified local Spiral first;
- Host Signal location-check returns green for the correct Fort Worth boundary;
- outside-city host is blocked while joining remains allowed;
- two clients connect through LiveKit and exchange microphone audio;
- admin Review → Verify → Promote → GPS Active → Revoke lifecycle passes with disposable state cleanup.
