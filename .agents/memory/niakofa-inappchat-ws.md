---
name: Niakofa InAppChat shared WS
description: InAppChat was broken because it opened its own WebSocket that never registered and was closed at 15s auth timeout. Now fixed to use the shared wsClient singleton.
---

# InAppChat WS fix

**Why:** The old InAppChat created `new WebSocket(url)` directly without sending a `register` message. ws-hub closes unauthenticated sockets after 15 seconds. All in-flight messages were lost.

**Fix:**
- `wsSend(data)` exported from `wsClient.ts` — sends via the already-authenticated shared socket.
- `InAppChat.tsx` subscribes to `chat_message` and `typing` events via `wsSubscribe`.
- `GET /requests/:id/messages` REST endpoint loads history on mount (last 100 messages from `chatMessagesTable`).
- `POST /requests/:id/messages` REST fallback for when WS is disconnected.
- `ws-hub.ts` handles `chat_message` type: verifies participant, persists to DB, routes via `sendToRequestParticipants`.
- Both `WsEventType` (server + client) now include `"typing"` and `"chat_message"`.

**How to apply:** Any new chat-like feature should always use the shared wsClient. Never open a second parallel WebSocket from a component.
