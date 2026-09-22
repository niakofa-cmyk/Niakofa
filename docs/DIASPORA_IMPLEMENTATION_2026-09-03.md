# Diaspora implementation — 2026-09-03

## Product journey
Globe → Family → Stories → Tree → Research → Connections → Legacy.

## Globe
- Live `GET /api/griot/hubs` data remains the source of hub counts and locations.
- Live Griot stories are loaded from the API.
- Hub selection filters the story layer.
- Globe projection and migration-style arcs remain visual anchors.
- Story playback now uses the stored `audio_url`; the UI no longer simulates playback with a timer.
- Hub member totals are explicitly labeled as hub-level counts, not unique people.

## Research workspace
Research is now a private Family Space workspace with:
- persistent research cases and questions
- evidence records with source URL, citation, evidence type, notes, and confidence
- separate research notes for observations and contradictions
- status/confidence tracking
- Research → Timeline handoff with provenance metadata
- authenticated Family Space membership checks on every endpoint

Migration: `0121_diaspora_research_workspace.sql`.

## DNA Connections
The existing ingestion/matching infrastructure is deliberately retained as a derived-sketch system. The Connections surface adds:
- explicit Family Space consent
- candidate names and Family Space context
- refresh and revocation controls
- research-case evidence handoff
- plain-language caveats

The current sketch engine is **not** a substitute for provider-quality shared-cM/IBD matching. It does not calculate parentage, paternity, legal identity, forensic identity, or ethnicity. Relationship hypotheses require documentary/genealogical review.

## Fingerprint decision
Biometric fingerprints are not used for genealogy. They are not a useful family-relationship signal and would introduce unnecessary biometric privacy obligations. A cryptographic fingerprint of a DNA dataset can still be used for provenance/deduplication without storing the raw export, but it is not itself a relationship match.

## Validation
Run:
- `pnpm run test:diaspora-experience`
- `pnpm run test:diaspora-data-loop`
- `pnpm run test:dna-matching`
- `pnpm run typecheck`
- `pnpm run lint`

The PR must be treated as unvalidated until GitHub Actions reports green and migration 0121 is confirmed against the deployment database.
