# Niakofa Exchange roadmap reference

This note records how the supplied Exchange roadmap and Niakofa UI/Stories
reference packages were adapted to the existing application. It is a product
reference, not a second architecture.

## Non-negotiable boundaries

- Keep Exchange inside the existing Express + Drizzle + Postgres/PostGIS API.
- Keep one authenticated identity, one Messages product, durable media, and
  existing scoped realtime contracts.
- Do not restore `/api/messages/stories` or a `message_stories` table.
- Never expose exact addresses, phone numbers, email addresses, or raw
  geolocation through Exchange responses.

## Roadmap implementation order

1. Notification preferences: optional Exchange discovery and digest controls
   are stored in `user_settings`; server-side push delivery is authoritative.
   Emergency and active pickup coordination remain essential.
2. Fulfillment and impact: completed Exchange counts derive only from the
   two-party pickup confirmation lifecycle. Client activity is not treated as
   proof of completion.
3. Stale archival: active listings with no requested/accepted coordination are
   soft-archived after 30 days. History and completed rows remain intact.
4. Weekly digest: opted-in users receive a coarse, geospatially matched digest
   from approved active listings. Rounded listing coordinates are matching data
   only and never part of the public contract.

## Privacy and reliability rules

- Listing coordinates are rounded before persistence and used only for
  server-side distance checks.
- Digest delivery uses a Postgres uniqueness ledger keyed by user and UTC
  week, so restarts do not create duplicate weekly sends.
- Preference writes support an expected timestamp and return a conflict when a
  different session has already changed the row.
- Impact views must use verified lifecycle states and privacy-safe aggregates;
  do not add raw message or analytics-table shortcuts.