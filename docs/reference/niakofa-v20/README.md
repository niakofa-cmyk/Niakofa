# Niakofa V20 reference — Direct Message Attachments

This directory preserves the architectural decision from the uploaded V20 review package.
The reference package was audited against the canonical `artifacts/` source before implementation.

## Decision

- Keep one Messages product: **All | Direct | Requests | Hubs**.
- Do not create another Community feed, Direct-message backend, or Diaspora messaging product.
- Store Direct-message attachment bytes through the existing storage abstraction.
- Store only private object metadata and the relationship to `direct_messages` in PostgreSQL.
- Require approved conversation membership for every attachment read.
- Enforce five attachments per message and a five-megabyte limit per attachment.

## Implemented contract

- `direct_message_attachments` is linked to `direct_messages` with cascade deletion.
- Direct sends accept text, attachments, or both.
- Attachment metadata is returned with thread messages and realtime Direct-message events.
- Attachment media is served through an authenticated, conversation-scoped endpoint.
- The browser fetches private media with the existing bearer-auth headers before rendering it.
- Storage objects are removed when a message transaction fails after an object was written.

The original uploaded package remains in `attached_assets/` as source material; this file is the
canonical project reference rather than a second implementation.