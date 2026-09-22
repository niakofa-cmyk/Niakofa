---
name: Niakofa WS Hub & DB Helpers
description: New exports added to ws-hub.ts and new db-helpers.ts; wiring decisions and security notes.
---

## WebSocket Hub (ws-hub.ts) additions

### New functions
- `sendToRequestParticipants(requesterId, helperId | null, event)` — replaces the repeated pattern of `sendToUser(requester) + if(helper) sendToUser(helper)`. Routes should use this for all request lifecycle participant notifications.
- `sendToUsers(userIds[], event)` — deduplicates by userId, single pass. Use for multi-recipient broadcasts that aren't the full channel.
- `isUserOnline(userId)` — checks open socket count (source of truth), NOT presenceMap. Use for dispatch heuristics.
- `getConnectedUserIds()` — returns all user IDs with ≥1 open socket. Used by getHubMetrics.
- `getHubMetrics()` — returns `{total_connections, registered_users, presence_tracked, presence_counts, online_user_ids}`. Wired into GET /api/admin/worker-health as `websocket_hub` field.

### Security fix: presence handler
Presence update messages from clients must now bind to `registeredUserId` (server-verified after token auth), not the client-supplied `userId` in the payload. Before this fix, any open WS could set presence for arbitrary user IDs.

### 15 typed payload interfaces exported
`RequestEventPayload`, `PresenceEventPayload`, `PoolEventPayload`, `HelperLocationPayload`, `NiaStatusPayload`, `NiaCostAlertPayload`, `HelpChainPayload`, `PledgeEventPayload`, `LeaderboardUpdatePayload`, `TrustTierChangePayload`, `CrisisUpdatePayload`, `ReportEventPayload`, `GratitudeEventPayload`, `PayoutEventPayload`, `AdminSummaryPayload`.

### Presence-on-register behavior
When a socket passes token-verified registration, the hub now immediately broadcasts `presence_update` with status `ONLINE` (but only if the user was previously OFFLINE or absent). Done inline without calling `setPresence()` to avoid the re-broadcast path.

---

## DB Helpers (artifacts/api-server/src/lib/db-helpers.ts)

### All exports
- `getUserById(id)` → `SafeUser | null` — uses `userSelect` (no password_hash, no geog)
- `getUsersByIds(ids[])` → `SafeUser[]` — single `inArray` query
- `getRequestById(id)` → `SafeRequest | null` — uses `requestSelect` (no geog)
- `getRequestsByIds(ids[])` → `SafeRequest[]`
- `getSystemSetting(key, defaultValue?)` — never throws; returns `defaultValue` on DB error or missing key (default: null)
- `getSystemSettings(keys[])` → `Record<string, string>` — single round-trip; missing keys absent from result
- `setSystemSetting(key, value)` — upsert with `onConflictDoUpdate`
- `setSystemSettings(entries)` — atomic multi-key upsert inside `withTransaction`
- `withTransaction<T>(fn)` — typed Drizzle transaction wrapper; tx handle has same API as db
- `userExists(id)` — lightweight COUNT query, no column fetch
- `requestExists(id)` — lightweight COUNT query

### Type inference
`SafeUser` and `SafeRequest` are inferred from Drizzle query builders:
```ts
const _userQuery = () => db.select(userSelect).from(usersTable).limit(1);
export type SafeUser = Awaited<ReturnType<typeof _userQuery>>[number];
```
This ensures types stay in sync with schema automatically.

---

## Routes updated

| File | What changed |
|---|---|
| `requests.ts` | `sendToUser(r) + if(h) sendToUser(h)` → `sendToRequestParticipants(r, h, event)` in help_chain_joined and help_chain_left |
| `admin-analytics.ts` | `getNiaEnabled()`, `setNiaEnabled()`, `upsertSetting()` dead helpers removed; routes now use `getSystemSettings`, `setSystemSettings`, `setSystemSetting` from db-helpers. Nia toggle now uses atomic `setSystemSettings` instead of inline `db.transaction`. Pool settings now uses `getSystemSettings`. |
| `health.ts` | `/admin/worker-health` adds `websocket_hub: getHubMetrics()` to response. Nia check in `/status` uses `getSystemSetting("nia_enabled")` instead of raw SQL. |

**Why:**
- `setSystemSettings` does all system_settings upserts in one atomic transaction.
- `getSystemSettings` does all reads in one round-trip (vs. N separate queries).
- Both eliminate copy-paste Drizzle boilerplate across routes and keep the pattern consistent.
