# Messages V22 production reference

This reference preserves the supplied Messages review materials and records the
source revision used for the production-readiness pass.

## Source materials

- `uploads/2026-09-18/messages-v22/review.md` — line-by-line gap review of the
  Messages workspace against the supplied UI reference.
- `uploads/2026-09-18/messages-v22/implementation-summary.txt` — supplied
  implementation summary for the six requested areas.
- `uploads/2026-09-18/messages-v22/messages-reference.png` — supplied visual
  reference image.
- `attached_assets/Niakofa-feat-messages-v22-context-realtime-rtc_1789781531595.zip`
  — locally extracted and reviewed as the implementation source. The archive is
  not duplicated in this repository because it is a 55 MB full-repository
  snapshot; the production source below contains its reviewed changes.

## Revision provenance

- GitHub `main` baseline: `d2308103` — `Enhance contextual Messages workspace`
- Reviewed implementation: `392530f5` — `fix(messages): clear revoked shared-media object URLs on gallery tab changes`
- Feature branch base: the reviewed implementation is 29 commits ahead of the
  GitHub `main` baseline and changes only the Messages/API/database surfaces
  plus the V22 contract coverage.

## Requested capabilities covered

1. Durable Request/Hub unread state backed by `message_read_states`, with
   authoritative aggregate unread counts and read-state synchronization.
2. Live Request/Map context in Messages, including helper location, route,
   distance, ETA, status, and throttled route refresh.
3. First-class Hub-to-Hub conversation presentation with source/target hub
   identity, hub-specific bubbles, approved-member authorization, and realtime
   updates.
4. Authenticated Shared Media gallery for photos, videos, audio, files, links,
   and location-oriented context from stored attachments.
5. Unified Direct/Request/Hub realtime event handling in the Messages workspace,
   including request lifecycle and read-state events.
6. Authenticated Direct voice/video RTC using LiveKit one-to-one rooms, short
   lived tokens, call signaling, accept/decline/end, mute, camera controls, and
   block enforcement.

## Verification boundary

The feature contract is in
`tests/messages-v22-enhancement.contract.test.ts`. Production readiness still
requires a migrated database, configured Mapbox/LiveKit/provider secrets, a
restarted API and web workflow, and authenticated end-to-end acceptance against
the deployed origin. Secret presence alone is not certification.