# Diaspora Refresh + Family Connection Blueprint — 2026-09-03

## Product verdict

The Diaspora architecture is now strong enough to move from feature-directory UX to a **living family archive**. The Globe should remain the visual anchor, but the page should guide people through a single narrative:

**Globe → Family → Stories → Tree → Research → Connections → Legacy**

The current repository already has a Globe-first dashboard, Family Spaces/Vault/Tree/Timeline flows, persisted Preserve QR scans and aggregate dashboard counts. PR #24 is merged into `main`. Research is still a guide/catalog rather than a durable evidence workspace, and the shared theme exists but is not yet propagated consistently across every child page.

## Visual refresh

Use the existing semantic palette as a system rather than adding arbitrary page colors:

- **Teal — Connection:** Globe, community hubs, relationships, discovery.
- **Gold — Legacy:** ancestors, preservation, lineage milestones.
- **Rose — Human story:** oral history, memories, elders, lived experience.
- **Emerald — Family growth:** family members, tree growth, confirmed relationships.

Recommended hierarchy:

1. **Globe hero:** living map + invitation to explore origins and communities.
2. **Family pulse:** family spaces, people, memories and stories as trustworthy aggregates.
3. **Continue the journey:** three high-value actions rather than a six-card feature grid.
4. **Recent family activity:** bounded feed with deep links into the real record.
5. **Connections preview:** explain that possible relatives are evidence-backed hypotheses, not automatic matches.
6. **Legacy prompt:** one clear preservation action.

Avoid making the product feel like an analytics dashboard. The numbers should support the story, not become the story.

## End-to-end audit

| Area | Current state | Recommendation |
| --- | --- | --- |
| Globe | Real API-backed hub/activity experience | Keep as centerpiece; add explicit origin/family handoff |
| Family Spaces | API-backed | Keep |
| Family Vault | API-backed memories/uploads/oral history | Keep; add stronger story-to-person linking |
| Family Tree | API-backed relationships | Add evidence provenance to relationship edges |
| Timeline | API-backed | Add “Preserve this” entry points |
| Heritage | API-backed catalog/contributions | Connect contributions to family/place context |
| Preserve QR | Persisted scan + durable link endpoint | Add camera scanner and visible association confirmation |
| Research | Guide/catalog | Build Research Case → Evidence → Note → Tree/Timeline handoff |
| DNA | Real export parsing + derived fingerprint/marker summary | Build consented matching service; do not fabricate matches |
| Griot hubs | Real hub data | Add contract/integration tests and clearer aggregation semantics |
| Theme | Shared semantic tokens | Propagate to every Diaspora child page |

## Family connection model

A useful connection system should combine **genealogy evidence + user-entered relationships + DNA evidence**.

Recommended flow:

`Candidate person → evidence bundle → user review → relationship hypothesis → optional tree link`

Evidence can include:

- census, birth, marriage, death and immigration records;
- cemetery, church, military and land records;
- family photographs and documents;
- oral-history statements;
- shared places and migration history;
- explicit pedigree relationships;
- genetic evidence such as shared segments when the source provides them.

Every suggested connection should show **why** it appeared and which evidence supports it. Never display a match score as a percentage of certainty.

## DNA architecture

The existing DNA path parses an uploaded export and stores a derived fingerprint/marker summary while discarding the original export. That is a sound privacy-oriented ingestion boundary, but a dataset fingerprint is **not a relationship match**.

Next architecture:

1. Consent + purpose selection.
2. Provider/export ingestion.
3. Normalize compatible marker formats.
4. Store only the minimum derived data needed for matching.
5. Calculate compatible shared-segment evidence when the source supports it.
6. Produce candidate connections with provenance.
7. Let the user review/accept/reject the hypothesis.
8. Only then offer a tree-link action.
9. Allow deletion/retention controls and revoke matching consent.

Do not use ethnicity estimates as a proxy for family relationship. Do not infer parentage or identity from a single DNA similarity signal.

## Fingerprint scanning: recommendation

A conventional biometric fingerprint scanner should **not** be used as the primary way to discover relatives. Fingerprints are useful for authentication in tightly controlled environments, but they are not a reliable genealogical relationship signal and would introduce substantially more biometric privacy risk.

If “fingerprint” is intended to mean a **privacy-preserving DNA dataset fingerprint**, that is useful for deduplication, provenance and consented dataset handling. It should remain clearly named as a dataset fingerprint so users do not confuse it with a biometric fingerprint or a DNA relationship match.

## Research workspace target

The next durable model should be:

`Research Case → Person → Source → Evidence → Note → Confidence → Tree/Timeline handoff`

Minimum fields:

- case title/status;
- person/ancestor reference;
- source URL or archive identifier;
- source type/date;
- evidence excerpt or attachment reference;
- research note;
- confidence;
- reviewer;
- created/updated timestamps;
- resulting tree/timeline action.

## Testing target

Move beyond source-string contract tests toward endpoint-level tests for:

- `/api/griot/hubs` response shape and aggregation semantics;
- `/api/diaspora/preserve/scan` action semantics;
- persisted `scan_id` and link completion;
- ownership and Family Space authorization;
- idempotent QR linking;
- DNA consent/retention boundaries;
- research evidence CRUD and tree/timeline handoff.

## Recommended next release sequence

### Phase 1 — Experience refresh

Globe hero, family pulse, three-action journey, connection preview, shared semantic tokens.

### Phase 2 — Research workspace

Persist research cases/evidence/notes with provenance and handoffs.

### Phase 3 — Connection engine

Build a reviewable evidence graph that can combine genealogy and consented genetic evidence.

### Phase 4 — DNA matching

Only after the evidence graph and consent model are mature. Start with transparent candidate ranking and shared-segment evidence, not a black-box “you are related” claim.
