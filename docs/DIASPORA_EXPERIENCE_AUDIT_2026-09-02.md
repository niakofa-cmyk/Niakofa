# Niakofa Diaspora Experience Audit — 2026-09-02

## Recommendation
Refresh the Diaspora area around three visual anchors: **teal (connection), gold (legacy), and ember/rose (human story)**. Make the **Diaspora Globe the primary visual doorway**, then lead users through Family → Oral History → Tree → Heritage → Research → Legacy.

## Current wiring
- `/diaspora` is routed and loads `/api/diaspora/dashboard` + `/api/diaspora/activity`.
- `/diaspora/family` is wired to `/api/family/mine`, creation, invitations, and then `/family/:id`.
- `/family/:id` is substantially end-to-end: memories, uploads, interviews/recording, transcription, members, GEDCOM import, translation, and delete.
- `/diaspora/tree` is substantially end-to-end: tree read, relationship create/delete, member detail edits, and relationship explorer.
- `/diaspora/heritage` is wired to a curated API catalog and detail route, but detail items currently return an empty array; contribution/storage is not end-to-end.
- `/diaspora/research` is a curated guide catalog with external resources, not an internal research-record workflow.
- `/diaspora/preserve` is wired to a card catalog and QR scan resolver, but scan/link persistence is not a full end-to-end workflow.
- `/diaspora/timeline` reads/writes family-memory-backed timeline events.
- `/diaspora/heritage/globe` is backed by live `/griot/hubs` data and is the strongest candidate for the visual centerpiece.
- **DNA is not end-to-end yet.** The UI/API currently use demo match and ethnicity data; the import endpoint records file metadata rather than receiving/parsing the DNA file.

## Refresh implemented in this package
- Reordered the dashboard around the Globe first.
- Introduced a consistent Niakofa teal/gold visual language.
- Reduced the dashboard from a long feature catalog to clearer task-oriented sections.
- Kept real Family/Vault/Oral History/Tree metrics as the dashboard's primary stats.
- Removed DNA counts/promotional fake-match presentation from the dashboard.
- Added trust-first DNA copy explaining that connected data is required.
- Preserved existing route contracts and Nia integration.

## Next recommended phase
1. Replace the Globe placeholder artwork with the actual globe thumbnail/snapshot when a stable asset pipeline is available.
2. Create a dedicated Oral History route/deep link so the dashboard can land directly in recording mode.
3. Build persisted Heritage Collection items/contributions.
4. Complete Preserve QR → memory linking persistence.
5. Design and implement a real DNA ingestion pipeline before exposing DNA match/ethnicity results.
6. Add a shared Diaspora design-token component so child pages stop declaring independent color maps.
