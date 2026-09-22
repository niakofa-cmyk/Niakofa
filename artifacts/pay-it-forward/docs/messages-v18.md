# Niakofa Messages V18

## Product boundary

`/messages` remains one messaging product. V18 changes the presentation and
frontend composition; it does not add a second messenger, request system, or
Hub authorization path.

| Surface | Existing source of truth |
| --- | --- |
| Direct | `/api/messages/direct*`, approved-account checks, block/report, WebSocket `direct_message`, REST fallback |
| Requests | `/api/requests*` and the existing `/api/requests/:id/messages` chat |
| Hubs | `/api/diaspora/hub-messages*`, source-Hub membership and conversation authorization |

The legacy `/diaspora/messages` route still renders the canonical page.
`/request/:id` remains the operational request workflow; Messages provides a
conversation view and an explicit link back to that workflow.

## V18 shell

The page is composed as:

```text
MessagesShell
├── MessagesSidebar
│   ├── All / Direct / Requests / Hubs
│   └── approved people search results
├── ConversationList
│   └── UnifiedConversation projections
├── ConversationThread
│   ├── existing Direct messages and read state
│   └── existing request chat when a request is selected
└── ConversationInfoPanel
    ├── existing profile route
    ├── block
    └── report
```

`UnifiedConversation` is a frontend adapter only. Direct, Request, and Hub
records remain separate in storage and are mapped into the list at render time.
The All view sorts those projections by their existing timestamps.

Desktop uses the sidebar/list/thread/info workspace. On small screens the shell
shows one state at a time: list, thread, or info. The composer preserves
safe-area padding and keeps attachment and emoji affordances disabled until
real storage/picker infrastructure exists.

## Unread summary

`GET /api/messages/unread-summary` is registered in the API router and requires:

1. a valid Bearer token;
2. an approved, non-suspended account;
3. a non-revoked token version.

Direct counts are derived from unread messages in active conversations and are
counted once per conversation. Requests and Hubs return zero until their
backends have durable per-user read state. Database failures are allowed to
reach the API error boundary; they are not converted into a false zero.

## Realtime and safety invariants

- Direct WebSocket registration, reconnect refresh, and 30-second REST fallback
  remain page-owned behavior.
- Opening a Direct conversation still marks it read through the existing API.
- Search continues to use the approved-user endpoint, which excludes blocked
  and suspended accounts.
- Block and report continue to use the existing Direct endpoints.
- Hub conversation loading and sending remain delegated to the existing
  `HubMessagesPanel`; V18 does not weaken source-membership checks.
- Voice/video controls are disabled placeholders, not fake sessions.
- Shared-media counts are not displayed without real attachment data.

## Verification

The integration gate is:

- frontend typecheck;
- API typecheck;
- frontend production build;
- API production build;
- unauthenticated unread-summary request returns `401`;
- preview workflow starts without browser console errors;
- authenticated Direct/Request/Hub acceptance remains covered by the existing
  application contracts and real-device limitations are reported separately.