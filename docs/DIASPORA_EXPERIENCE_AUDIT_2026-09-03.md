# Niakofa Diaspora Experience Audit — 2026-09-03

## Verdict
The Globe-first direction is now the right product architecture, but the Diaspora area is **not yet fully end-to-end**. The core family-story loop is strong; the remaining gaps are mostly at the edges: physical QR persistence, true research workspace behavior, real DNA matching, and visual consistency across child pages.

## Current state

| Surface | State | Notes |
|---|---|---|
| `/diaspora` | ✅ Strong | Live dashboard stats, activity, Globe CTA, journey navigation, Nia bridge |
| Family Spaces | ✅ Strong | API-backed membership, creation, invitations |
| Family Vault | ✅ Strong | Memories, uploads, oral histories, transcription, members, GEDCOM and translation flows |
| Family Tree | ✅ Strong | Read/write tree, relations, person edits and explorer |
| Timeline | ✅ Strong | Family-memory-backed timeline read/write |
| Diaspora Globe | ✅ Strong | Live `/griot/hubs`, story layer, migration arcs and hub activity |
| Heritage | 🟢 Functional | Catalog, detail view and persisted contribution submission/moderation route exist; content depth depends on published items |
| Research | 🟡 Guide workspace | Useful curated/external resources, but not yet a first-class persisted research case/evidence workspace |
| Preserve | 🟡 Partial | QR resolver works; card QR resolves to a record-story action. A non-card QR currently returns `link_memory` guidance rather than persisting a memory association |
| DNA | 🟡 Parsed, not matched | Provider exports are actually parsed in memory and reduced to a derived marker profile; no supported relative-match or ethnicity source is connected, so results remain unavailable |

## Important corrections from the previous audit

1. **DNA ingestion is no longer merely metadata-only.** The current API accepts raw export bytes, parses them with `parseDnaExport`, stores a derived fingerprint/marker summary, discards the original file, and applies retention expiry. It deliberately returns no matches or ethnicity without a real result source.
2. **Heritage contributions are now persisted through the API.** The previous statement that contribution storage was absent is stale.
3. **Oral History has a real deep-link helper.** `/diaspora/family?intent=oral-history` and `/family/:id?tab=record` are supported by the existing helper/redirect flow.
4. The dashboard refresh should use the global Nia drawer rather than maintaining a second full chat experience on the home page.

## UX direction

The intended hierarchy is:

**Globe → Family → Stories → Tree → Heritage → Research → Legacy**

The new dashboard reinforces this by making the Globe the emotional/visual anchor and treating the other capabilities as a connected journey rather than unrelated utilities.

## Remaining engineering priorities

### P0 — Trust and correctness
- Add real automated tests around the Globe data contract and Preserve QR action contract.
- Keep DNA results gated on provenance-backed matching/ethnicity sources.
- Avoid presenting fallback/demo counts as live community metrics.

### P1 — Complete the preservation loop
- Persist a QR-to-memory association after the user chooses a Family Space and memory.
- Add a dedicated recorder route/state so a prompt can carry into the recording UI without relying on query conventions.
- Add a first-class "Preserve this" action from Timeline/Heritage back into the Vault.

### P1 — Make Research a real workspace
- Persist research cases/projects.
- Save evidence links and notes against an ancestor/person.
- Add source confidence and citation metadata.
- Allow Research → Family Tree / Timeline handoff.

### P2 — Design-system consolidation
- Replace page-specific color maps with shared Diaspora semantic tokens.
- Use teal for connection, gold for legacy, rose for human story, emerald for family growth.
- Keep blue/purple/red as restrained functional accents, not page identities.
- Standardize the same header, navigation rail, card radius, focus states and CTA hierarchy across child pages.

## Visual recommendation

The Diaspora pages should feel like a **living archive**, not a SaaS admin dashboard. The Globe should be the cinematic opening, Family should be the intimate workspace, Oral History the human heartbeat, Tree the structural view, Heritage the public cultural layer, Research the evidence layer, and Timeline the legacy output.

The current implementation is now directionally aligned with that vision. The next work should complete the few missing data loops rather than adding more standalone features.
