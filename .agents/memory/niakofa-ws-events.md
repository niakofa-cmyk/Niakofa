---
name: Niakofa WS Event Type Parity
description: wsClient.ts WsEventType must stay in sync with ws-hub.ts WsEventType; missing types cause silent handler failures.
---

# WS Event Type Parity

## Rule
`artifacts/pay-it-forward/src/lib/wsClient.ts` `WsEventType` is the **frontend copy** of `artifacts/api-server/src/lib/ws-hub.ts` `WsEventType`. They must stay identical. Missing frontend types mean event handlers that match on the type string will silently never fire.

**Why:** TypeScript's union type on the frontend is used for handler dispatch in `useWebSocket.ts`. If a new event type is broadcast by the server but missing from the frontend union, the handler just never matches — no runtime error, completely silent failure.

**How to apply:** Any time a new WsEventType is added to `ws-hub.ts`, add the identical string literal to `wsClient.ts`. Last sync (2026-07-03) added:
- `REQUEST_CANCELLED`, `pool_updated`, `pool_front_paid`, `pool_low_balance`
- `help_chain_joined`, `help_chain_left`
- `nia_message`, `nia_checkin`, `nia_crisis_alert`, `nia_memory_update`, `nia_typing`, `nia_status`, `nia_cost_alert`
- `wallet_cashout`, `wallet_cashout_reversed`
