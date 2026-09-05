# Niakofa Spirals migration references

This directory preserves the user-supplied product specification and the
original forensic-fixes archive. The specification copy has trailing whitespace
normalized for repository hygiene; the source upload remains untouched.
`SHA256SUMS` records the archived bytes.

## Integration boundary

- **Canonical product identity:** user-facing navigation, discovery, room,
  invitation, recording, moderation, and accessibility language uses Niakofa
  Spirals.
- **Compatibility retained:** Circle-era URLs, API contracts, database names,
  persisted records, internal TypeScript identifiers, and `circle_*` realtime
  events continue to work. Existing sessions and bookmarks are not broken.
- **Canonical routes:** `/audio-spirals`, `/audio-spiral/:id`,
  `/api/audio-spirals`, and `/api/audio-spiral-sessions/*`.
- **Legacy aliases:** `/audio-circles`, `/audio-circle/:id`,
  `/api/audio-circles`, and `/api/audio-circle-sessions/*`.
- **Forensic fixes integrated selectively:** bounded and batched participant
  reads, read-path provisioning isolation, corrected atomic host failover, and
  fail-closed Nia-service summary generation.

The archive's complete-file snapshots were not copied wholesale. Current source
was edited so newer payment, county, LiveKit, security, and deployment hardening
remains intact. Internal Circle names remain deliberate compatibility details,
not unfinished user-facing branding.