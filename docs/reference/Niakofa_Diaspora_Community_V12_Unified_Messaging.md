# Niakofa V12 Community + Diaspora Unified Messaging reference

This reference records the uploaded V12 package and the production integration
decisions applied to the canonical `artifacts/` source tree. The uploaded
archives remain in `attached_assets/` for full line-by-line review.

## Source packages

- V12 package: `attached_assets/Niakofa_Diaspora_Community_V12_Unified_Messaging_1789682821214.zip`
- V12 package SHA-256: `3517a8fa020c600b055216fd5488528b3bf331f2574512eea2d9727655fe3d56`
- Evaluation package: `attached_assets/Niakofa_Community_Messaging_Evaluation_2026-09-17_1789682826959.zip`
- Evaluation package SHA-256: `d330c59bfa9d247f376bf220b8316bc86927a4e83cbb4d5c0717f09561627119`
- V12 pasted design note SHA-256: `9264c297d3c40572b6e302334497d27d0866287f04c619ec039301f6349e0299`
- Evaluation pasted note SHA-256: `340c2a69a833be2dd94c42488be057781f669689001259d09ef59c7eac4db471`
- Evaluation date: 2026-09-17
- Baseline reviewed: `69e060a60b2f167dd96704fdaab0a14b53f547d4`

The evaluation archive contains the same V12 package files as the standalone
V12 archive plus `EVALUATION.md`; their extracted package file hashes matched.

## Product contract

Niakofa has one user-facing Messages experience with three bounded conversation
kinds:

- Direct: approved Niakofa user to approved Niakofa user.
- Requests: existing request-scoped chat, still authorized by request
  participation and opened from the existing request flow.
- Hubs: existing Hub-to-Hub messaging, still authorized by approved source
  membership; target membership is not required.

Community remains the local operating center. It exposes only a compact
`Message people` entry point and does not become a second messenger.

Diaspora remains Globe-first. Hub actions route to
`/messages?mode=hub&sourceHub=<id>`, while `/diaspora/messages` remains a
compatibility path for the existing Hub composer.

## Production safeguards

- Direct-message routes require both authentication and an approved,
  non-suspended account.
- Direct conversation reads require conversation membership.
- Direct sends reject self-messaging, invalid recipients, empty/oversized
  bodies, unapproved/suspended recipients, and either-direction blocks.
- Direct users can block or unblock another user.
- Direct conversation reports are persisted for moderation follow-up.
- Reading a direct conversation marks incoming messages read.
- Existing request and Hub messaging schemas and authorization paths remain
  unchanged.
- No GPS value creates Hub membership. Home Hub automation and V11 governance
  rules remain authoritative.

## Integration checklist

- Direct-message schema exported through `lib/db/src/schema/index.ts`.
- Migration `0144_direct_messages.sql` adds conversations, members, messages,
  blocks, and reports.
- Direct API registered in `artifacts/api-server/src/routes/index.ts`.
- Canonical `/messages` route added to the authenticated frontend router.
- Direct inbox, approved-user search, send, read, block, and report flows are
  wired end to end.
- Request entries link to the existing request chat page.
- Hub entries link to the compatibility Hub composer without replacing it.
- Community and BottomNav expose the canonical Messages surface.
- Globe Hub deep-link helper preserves `sourceHub` in canonical mode.

## Realtime delivery

Direct messages use the existing authenticated `/ws` channel for targeted
delivery to both conversation members after the message is durably persisted.
The frontend deduplicates event delivery by message ID, refreshes the inbox on
reconnect, and uses a 30-second selected-conversation REST refresh only while
the websocket is disconnected. Request chat retains its existing WebSocket
behavior, and Hub chat retains its existing REST behavior.

The direct-message event is emitted only after the existing approved-account,
block, and conversation-membership checks complete. Realtime transport does not
change any conversation authorization boundary.