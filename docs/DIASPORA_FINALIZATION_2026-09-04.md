# Diaspora finalization — 2026-09-04

## Product verdict
The canonical Diaspora implementation is now close to the intended living-archive architecture:

`Globe → Family → Stories → Tree → Heritage → Research → Connections → Legacy`

The September 3 audit's core workspace recommendations are represented in the canonical `artifacts/` application rather than the historical `niakofa-repo/` mirror.

## Globe
- Live Griot hubs and stories remain the source of map data.
- Globe projection, migration arcs, hub activity, story detail, playback, translation review, reporting, refresh, and shareable hub deep-links are wired.
- Journey chips connect Globe to Family, Oral History, Tree, Research, DNA, and Legacy.
- Hub-level member counts are explicitly not presented as unique global people.

## Research
- Research cases are persisted in PostgreSQL.
- Cases are scoped to active Family Space membership and may attach to a family person.
- Evidence stores source URL, citation, evidence type, confidence, notes, and source date.
- Research notes are persisted separately from evidence.
- Status transitions are validated server-side and mirrored by the frontend.
- Timeline handoff creates a provenance-tagged family event without silently resolving the research case.

## DNA Connections
- Matching is explicitly opt-in and Family Space scoped.
- Only active, consented, retention-valid profiles enter the comparison cohort.
- The engine compares one-way derived marker sketches and now uses symmetric Jaccard similarity rather than a min-set denominator.
- Scores are intentionally low-confidence discovery signals. No shared-cM, IBD, ethnicity, paternity, legal identity, or forensic result is manufactured.
- Result persistence is atomic and bounded.
- The Connections response is sanitized and uses a single candidate identity query rather than N+1 lookups.
- `shared_cm_est` is nullable because the current engine does not calculate shared cM; migration `0123_dna_matching_shared_cm_nullable.sql` enforces that runtime contract for existing databases.

## Remaining boundary
Provider-grade DNA matching still requires a real provenance-backed provider/segment source. The current implementation is intentionally not a fake substitute for that capability.

## Validation
The finalization branch adds contract coverage for:
- symmetric/bounded DNA sketch scoring
- no fabricated cM values
- schema/migration alignment
- canonical Globe/Research/DNA route registration
- Research schema/migration pairing
- all supported Research evidence kinds

Do not describe the current DNA engine as provider-grade until a real shared-cM/IBD source is integrated and independently validated.
