# Diaspora Final Wiring — 2026-09-04

This pass closes the last meaningful wiring gaps identified after the Diaspora hardening and finalization work.

## Completed

### 1. Research evidence selector → persistence

`ResearchEvidenceTypeSelect` is now used by the live Research capture form. The selected value is sent as `evidence_type` to `POST /api/diaspora/research/cases/:caseId/evidence`.

The six supported semantic types remain:

- document
- shared_segment
- pedigree
- oral_history
- place_history
- dna_profile

Confidence remains explicit and user-controlled; the UI does not silently upgrade evidence.

### 2. Preserve → recorder continuity

A successful Preserve QR resolution now persists its resolved `scan_id` in browser session context and carries it through the oral-history deep link.

When the existing Family Vault recorder creates the resulting memory, a narrow one-shot browser bridge attaches that memory to the preserved scan using the durable `/api/diaspora/preserve/links/:id` endpoint. The scan context is cleared only after the association succeeds.

The raw QR payload is still never persisted by the client bridge or database; the server remains responsible for the SHA-256 digest and ownership checks.

### 3. Live authenticated E2E

Added `e2e/diaspora-final-wiring-live.spec.ts` covering real authenticated API + browser flows for:

- Research evidence creation and persistence of the selected evidence type.
- Preserve repeat scans returning the same `scan_id` with `idempotent: true`.
- DNA consent opt-in followed by revoke, with the final state verified from the API and UI.

Because these scenarios intentionally write to a real database, they are gated behind `ALLOW_MUTATING_E2E=1` and require `USER_A_STATE`. The Research evidence test intentionally leaves an evidence row because the current API has no evidence-delete endpoint. DNA ends revoked. Preserve repeat scanning leaves one pending idempotent scan row.

### 4. Heritage metric semantics

The existing value `9` remains the curated Heritage catalog size. The dashboard now labels the metric **Curated heritage catalog** rather than implying that it is a user's contributed-content count.

This is deliberately clearer than pretending the catalog is a database-derived user metric.

### 5. Provider-grade DNA boundary preserved

No shared-cM or IBD result is fabricated. The current engine remains a consented, derived-sketch similarity lead generator with explicit low-confidence semantics and provenance.

Provider-grade DNA remains a separate future integration requiring actual provider/IBD provenance, licensing, retention, consent, and response validation.

## Verification additions

- `scripts/diaspora-final-wiring-contract.test.mjs`
- `test:diaspora-final-wiring`
- `test:diaspora-final-wiring-live`

## Production-complete gate

The code path is now wired end-to-end for the identified final gaps. Production-complete status should still be granted only after the repository CI run is green and the live deployed Chromium journey is rerun against the current deployment, including the new live integration suite where an approved disposable Family Space is available.
