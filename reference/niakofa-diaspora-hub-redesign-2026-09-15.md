# Niakofa Diaspora Hub redesign reference — 2026-09-15

This index preserves the review material used for the Globe-first Diaspora Hub
redesign.

## Product direction

- The Diaspora landing route is a focused Globe workspace, not a feature
  dashboard.
- Non-U.S. Diaspora Hubs represent countries.
- United States Diaspora Hubs represent individual states.
- Historical city Hubs remain durable local records and are grouped beneath
  their country or state for Globe display.
- Selecting a Hub exposes community, Hub messaging, Spirals, stories, and
  Community Pool navigation without creating a second messaging system or
  financial ledger.
- Hub messaging is a durable, canonical pair conversation. The sending Hub is
  selected only from approved membership, both Hubs must be approved, and
  messages are capped at 2,000 characters.
- Family, oral-history, Legacy, live-presence, and research capabilities remain
  available on their existing routes instead of competing on the landing page.

## Preserved review files

- `uploads/2026-09-15/Pasted-feat-diaspora-globe-first-Diaspora-Hub-experience-77-77_1789451598629.txt`
- `uploads/2026-09-15/Pasted-Fix-niakofa-cmyk-added-14-commits-6-hours-ago-feat-dias_1789451652492.txt`
- `uploads/2026-09-15/Pasted-Yes-I-proceeded-with-the-Globe-first-Diaspora-redesign-_1789452039778.txt`
- `uploads/2026-09-15/Pasted-1-Critical-ledger-reconciliation-can-declare-a-4-55-dis_1789451694252.txt`
- `uploads/2026-09-15/pr77-full-fix_1789452061221.patch`

The uploaded full-source ZIP was inspected and used to verify the supplied
implementation snapshot. It is intentionally not duplicated in Git because
the canonical source is the repository tree and the archive contains generated
outputs and a second full copy of the project.

## Security

The uploaded files were scanned for common credential-shaped values before the
review documents and patch were preserved. No credential-shaped values were
detected.

## Verification record — 2026-09-15

- Migration `0138_diaspora_hub_messages.sql` applied successfully in the
  development database.
- Authenticated local browser verification rendered the live Mapbox Globe with
  12 Hub markers and 12 village-pulse Hubs; Globe search was visible.
- Selecting a Hub and opening “Message hub” rendered the approved-membership
  gate for a member without a sending Hub.
- Screenshot evidence is preserved at
  `screenshots/diaspora-globe-authenticated-2026-09-15.png`.