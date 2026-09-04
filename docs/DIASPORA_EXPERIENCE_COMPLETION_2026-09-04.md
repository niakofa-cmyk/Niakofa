# Diaspora Experience Completion — 2026-09-04

## Current main baseline

The repository's current `main` is `ace24ba0b303f5f12c090c04eea735e5da4b7d84`. PR #29 is merged as `7ce47048bfd4b0fb23c8d2c31c5efec8b4d18195`, and the latest production-facing commits also include the DNA import journey and the API-only CORS boundary fix.

## Product alignment

The intended journey is:

**Globe → Family → Stories → Tree → Research → Connections → Heritage → Legacy**

The dashboard now exposes that complete journey, including a first-class Connections step. The Globe remains the emotional entry point rather than an admin-style feature directory.

## What is substantially wired

- **Globe:** live hub/story data, globe projection, migration arcs, story playback/detail, translation review, reporting, and recording entry points.
- **Family:** Family Spaces, Vault, Tree, and Timeline remain connected to the dashboard journey.
- **Stories:** oral-history intent deep-linking is retained.
- **Research:** persistent cases, family-scoped people, evidence, notes, confidence, status transitions, and Timeline handoff are implemented.
- **Connections:** consent/opt-in, feature gating, retention-aware profiles, bounded results, privacy-safe response fields, atomic refresh, and explicit sketch-only provenance are implemented.
- **Preserve:** QR payloads are hashed rather than retained, repeated pending scans are database-bounded, and memory linking is ownership checked.
- **Production boundary:** CORS validation is scoped to `/api` so static SPA assets are not rejected by API origin policy.

## Remaining gaps that should not be disguised as complete

### 1. Research evidence selector wiring

The six evidence semantics are centralized and a semantic selector component exists, but the current Research page still contains a hard-coded `document` value in its submission payload. This should be the next UI wiring change: keep the selected type in state and submit that value to the existing authenticated evidence endpoint.

### 2. Preserve recorder context

The durable QR scan/link loop is now safe and idempotent, but the browser journey should carry the resolved scan context into the recorder/memory UI explicitly rather than relying on a generic family destination. A dedicated query/state contract should preserve `scan_id` and selected memory intent.

### 3. Live Heritage collection count

The dashboard/API path still has a curated `heritage_collections: 9` catalog value. It should remain clearly labeled as a catalog count or be replaced with a database-backed contribution/collection aggregate.

### 4. Browser/API/DB integration coverage

The repository has strong contract coverage, but source-pattern tests are not a substitute for authenticated browser tests against a deployed environment. The existing 10-journey Chromium verification should be kept as the deployment smoke suite and expanded around Research evidence capture, Preserve repeat-scan behavior, and DNA consent/revoke.

### 5. Provider-grade DNA remains intentionally unavailable

The current matcher is a **derived-sketch similarity lead generator**. It does not calculate shared-cM or IBD, and must not infer identity, parentage, paternity, forensic, or ethnicity findings. Provider-grade matching requires a real provenance-backed provider result, explicit licensing/retention rules, consent review, and validated response contracts.

## This branch

This completion pass adds:

- canonical journey configuration;
- a trust-first DNA provenance notice component for reuse by the Connections surface;
- a dashboard journey update that explicitly includes Connections and clarifies sketch-only DNA language;
- a completion contract suite registered in `package.json`;
- this audit so future work does not overstate end-to-end completeness.
