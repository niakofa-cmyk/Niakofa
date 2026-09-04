# Diaspora post-PR31 polish — 2026-09-04

## Verified main baseline

PR #31 is merged into `main`. The current `main` head is independently checked before this follow-up pass.

The core journey remains:

**Globe → Family → Stories → Tree → Research → Connections → Heritage → Legacy**

## This polish pass

1. **Globe geometry** — migration arcs now use bounded great-circle interpolation rather than a two-point straight line, which better communicates movement across a spherical globe and avoids implying a flat-map route.
2. **DNA trust UX** — the existing `DnaProvenanceNotice` is now actually rendered on the Connections page instead of existing as an unused component. The page continues to state that the current signal is a derived-sketch lead and not shared-cM/IBD, identity, parentage, paternity, forensic, or ethnicity evidence.
3. **Contract coverage** — the repository-wide Diaspora contract runner now includes the final wiring and experience-completion suites, plus the new Globe geometry tests. This prevents the most recent trust/wiring checks from silently falling outside the aggregate Diaspora test command.

## End-to-end status

### Wired and persisted

- Globe live hubs/stories, hub deep links, story detail, audio playback, translation review, reporting, and record-story navigation.
- Family Spaces, Vault/memories, interviews/oral history, Family Tree, and Timeline/Legacy.
- Research cases, people scoped to Family Space, six evidence kinds, confidence, notes, and Timeline handoff.
- Preserve QR digest persistence, repeat-scan idempotency, durable scan-to-memory association, and recorder continuity.
- DNA import parsing into a derived marker sketch, consent/revocation, bounded symmetric matching, sanitized candidate responses, and Research evidence handoff.
- Heritage is an explicit curated catalog rather than a falsely presented live user metric.

### Intentionally bounded

Provider-grade DNA matching remains a future adapter capability. The current engine must not invent shared-cM, IBD, relationship certainty, ethnicity, paternity, or forensic conclusions.

A provider-grade implementation should only be enabled after a real provider/import contract, provenance metadata, consent/retention policy, validated parsing, response integrity checks, and privacy/security review are in place.

## Production gate

Passing source contracts and repository CI are necessary but not sufficient for a production-complete claim. The final gate is:

1. green required CI on the final commit;
2. deployment of that exact commit;
3. authenticated Chromium verification against the deployed app;
4. approved/disposable Family Space for mutation tests (`ALLOW_MUTATING_E2E=1` + `USER_A_STATE`);
5. confirmation that Research evidence persists, Preserve repeat scans are idempotent and link correctly, and DNA consent can be revoked cleanly.

Do not mark production-complete when the branch has no deployment or when mutation verification has only been source-checked.
