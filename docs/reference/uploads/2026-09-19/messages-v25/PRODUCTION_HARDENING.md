# Niakofa Messages V25 — Production Hardening

Implemented in main:

1. **Active People directory**
   - GET /api/messages/people
   - Approved/suspended filtering is server-side.
   - Online state comes from the authenticated WebSocket socket registry, not fabricated profile data.
   - Active people are sorted ahead of offline people.

2. **Durable Stories**
   - message_stories table + migration 0148_messages_social_hardening.sql.
   - GET/POST/DELETE /api/messages/stories.
   - Stories expire after 24 hours.
   - Messages mobile UI renders only actual Story records; conversation avatars are no longer used as Story data.
   - Mobile includes a real Story composer and Story viewer.

3. **Durable Notifications**
   - message_notifications table + migration.
   - Direct messages, direct-call token creation, and Hub messages create durable notifications.
   - Notification events are pushed through the existing authenticated WebSocket.
   - Notification drawer reads, marks read, and marks all read through durable APIs.
   - Seed notifications remain only as a legacy fallback when the notification API cannot be reached.

4. **Ask Nia**
   - MessengerAskNia calls the existing /api/nia/chat proxy.
   - Streaming SSE deltas are rendered inside the Messages search surface.
   - Nia remains behind the existing api-server proxy, kill switch, auth and rate-limit boundary.

5. **Community ↔ Direct ↔ Hub continuity**
   - Hub messages now create durable notifications with a deep link back to the canonical /messages?mode=hub&conversation=... route.
   - Direct notifications deep-link to the exact conversation.
   - Call notifications deep-link to the exact direct conversation.
   - Existing Community/Hub/Spirals navigation remains intact.

6. **Production evidence**
   - Durable notification rows provide a server-side audit trail for actual direct messages, calls initiated through the call-token boundary, and Hub messages.
   - This is evidence infrastructure, not a claim that those interactions have already occurred in production.

7. **Device certification**
   - Automated/browser-ready coverage is documented separately.
   - Physical iPhone Safari and Android Chrome certification requires execution on physical devices; code changes cannot truthfully certify hardware testing.

8. **Visual pass**
   - Mobile Messages keeps the reference-oriented structure: Messages header, back-to-app control, compose/community actions, search/Ask Nia surface, real Story row, conversation list, and dedicated bottom navigation.
