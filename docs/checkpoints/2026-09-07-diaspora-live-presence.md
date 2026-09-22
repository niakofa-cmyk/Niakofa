# Niakofa checkpoint — Diaspora live presence

## Scope

This checkpoint adds the missing real-time physical-presence layer to the
Diaspora experience without changing the meaning of existing membership data.

### Metrics

- `member_count`: membership/leader aggregate.
- `live_user_count`: recent server-synced GPS presence inside a configured hub radius.
- neighborhood `live_user_count`: GPS-derived only when an effective verified
  neighborhood geometry contains the user's current fix.

### Wiring

GPS PATCH → dedicated `location_updated_at` → authenticated live-presence endpoint
→ nearest approved hub → aggregate hub counts → verified neighborhood counts →
Diaspora UI component.

### Safety/privacy

- 10-minute freshness window.
- One hub per user (nearest eligible hub).
- No raw coordinates in the presence response.
- No GPS history introduced.
- Unverified neighborhood geometry never becomes a boundary.
- Live acceptance is explicitly gated for disposable accounts.

## Verification status

The implementation is committed on branch `feat/diaspora-live-presence-neighborhoods-e2e`
and is intended for CI/PR validation before production deployment. This
checkpoint does **not** claim that the new layer is already deployed to Railway.
