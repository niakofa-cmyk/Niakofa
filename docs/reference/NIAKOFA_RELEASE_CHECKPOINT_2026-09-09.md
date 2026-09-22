# Niakofa release checkpoint — 2026-09-09

## Purpose

Durable checkpoint for the Niakofa Spirals hardening pass. This file points to the canonical product, visual, GIS, realtime, and release references so future reviews do not depend on chat history.

## Canonical references

- `docs/NIAKOFA_BUILD_REFERENCE.md` — production/build acceptance index.
- `docs/reference/uploads/2026-09-05/README.md` — archived user-supplied release and visual-reference package.
- `docs/reference/uploads/2026-09-05/spirals/spirals-product-specification.txt` — Spirals product concept and forensic remediation source.
- `artifacts/circles-visual-reference/public/images/reference/REFERENCE.md` — desktop/mobile live-room visual baseline.
- `reference/niakofa-circles-realtime-hardening-2026-08-24.md` — realtime hardening acceptance reference.
- `docs/reference/niakofa-spirals-location-geometry-2026-09-07.md` — GPS/neighborhood geometry acceptance contract.

## Current repository checkpoint

- `main` latest implementation checkpoint: `e15455708a1758b4e31329e7cad98a53e872a1c7`.
- Previous migration-ordering fix: `bd2b6eef23b819904ba4fc6c71184c6c5781d8ba`.
- Active neighborhood Spiral visibility was merged before the migration-ordering correction; city-wide and unverified neighborhood discovery rows remain preserved for compatibility rather than deleted.
- `0125_active_neighborhood_spiral_visibility.sql` is self-contained for fresh databases and now makes its visibility sentinel handling idempotent.

## Spiral discovery contract

1. Show the user's current GPS-verified neighborhood Spiral first when it is active and eligible.
2. Show other active authoritative neighborhood Spirals whose geometry is verified.
3. Do not expose every seeded neighborhood as a discoverable Spiral.
4. Do not expose city-wide Circles/Spirals through neighborhood discovery.
5. Do not treat generated reverse-geocoder neighborhood hints as authoritative geometry.
6. Preserve historical Circle-era records, sessions, follows, and compatibility identifiers.

## GIS activation contract

`Needs Review → Reviewed → Geometry Verified → Ready to Promote → GPS Active`

Geometry verification must inspect the original imported polygon/multipolygon. Explicit promotion is the GPS activation gate.

## Nia boundary contract

Nia remains a separate service boundary. Core Niakofa/Spirals functionality must remain available when Nia is disabled or unavailable; recording completion must not depend on AI summarization.

## Verification status

- Typecheck passed on the historical failing run before migration execution.
- Backend test suite passed: 44 suites / 382 tests passed, 5 skipped, before the historical migration failure.
- The historical CI failure for `9efd8243c7c4d4c76ef7e682bd1202a2cbd942b9` was caused by migration 0125 referencing `geometry_verified` before the later GIS migration created it.
- Deploy Verification for `bd2b6eef23b819904ba4fc6c71184c6c5781d8ba` completed successfully and verified production health, served-commit parity, Nia compatibility health, dependency readiness, and the public asset graph.
- Current-main CI for `e15455708a1758b4e31329e7cad98a53e872a1c7` must be treated as pending until its GitHub Actions run reports success; this checkpoint does not invent a passing result.

## External acceptance gates still requiring real-world evidence

Repository inspection cannot certify these without the corresponding production/device run:

- Real-device LiveKit reconnect, host loss/failover, co-host promotion, network switching, camera/mic denial, recording failure, and two-device operation.
- Authenticated production live-room E2E against the supplied desktop/mobile references.
- Real GPS fix → authoritative neighborhood polygon/radius containment → Spiral promotion/hosting eligibility.
- Production Stripe test-webhook walkthrough.
- Multi-instance realtime certification if horizontal app scaling is enabled.

## Security rule

Never commit credentials, API keys, browser storage-state JSON, passwords, or private location traces into this reference archive.
