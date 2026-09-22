# Hardening implementation map

## Data boundary

- `0139_diaspora_hub_geography_invariants.sql` normalizes canonical roots,
  guards approved canonical geography, and prevents duplicate approved
  country/state markers.
- `GET /api/griot/village-pulse` enriches approved rows for activity and local
  aggregation, then emits only canonical country/state roots.
- Grouped local Hubs remain attached as `local_hubs` on the canonical parent.

## UI boundary

- `DiasporaGlobeFirst` no longer presents Home as a geography.
- The landing panel is the Globe itself; redundant full-Globe navigation is
  removed.
- Hub actions remain contextual and preserve the existing Community,
  Messaging, Spirals, Stories, and Pool routes.

## Verification boundary

- Unit tests cover canonical country/state acceptance and rejection of Home,
  grouped, incomplete, and non-approved rows.
- Migration validation must run before API startup.
- Browser validation must verify canonical marker counts, local search,
  selected-Hub actions, the messaging gate, and mobile layout behavior.