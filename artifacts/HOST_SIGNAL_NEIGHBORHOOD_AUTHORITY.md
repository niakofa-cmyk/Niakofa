# Host Signal — Neighborhood Authority & Spiral Ordering

## Product rule

Host Signal Green is granted only when the server can match a user's **fresh pinpoint GPS verification** to a **reviewed, geometry-verified, explicitly promoted authoritative neighborhood boundary**.

A city match alone is not enough to turn Host Signal Green.

## User flow

1. The user performs a fresh GPS verification/ping.
2. The API evaluates the pinpoint against authoritative production neighborhood geometry.
3. If the point is inside a promoted neighborhood, the API returns that neighborhood as the verified local Spiral context.
4. The matching neighborhood Spiral is promoted to the top of the Spirals discovery list.
5. The green neighborhood checkpoint/Host Signal is shown only for that server-verified local match.
6. If the GPS is stale, outside the promoted boundary, or no authoritative geometry is available, the UI must not infer a green neighborhood state.

The ordering helper intentionally preserves the existing order of unrelated neighborhood Spirals and keeps city-wide Spirals last.

## Admin authority flow

The authoritative data lifecycle is deliberately separate from the user GPS flow:

```text
Municipal GIS source
      ↓
staged neighborhood boundary
      ↓
Review
      ↓
Geometry Verify
      ↓
Explicit Promote → GPS-active
      ↓
city_neighborhoods
      ↓
Host Signal eligibility
```

### What the administrator clicks

In **Admin → System → Boundary Imports (GIS)**, an administrator can:

- **Mark reviewed** — accepts the staged row for the next gate.
- **Verify geometry** — explicitly confirms the geometry is suitable for operational GPS matching.
- **Promote → Host Signal** — the final explicit action. This creates/updates the GPS-active neighborhood record used by Host Signal.
- **Unreview** — clears the review/verification state when a boundary needs to be reconsidered.

Generated neighborhood hints are permanently excluded from the verification/promotion path.

### City-level meaning

Cities are containers for neighborhood authorities, not a single GPS-green switch. A city can therefore have:

- neighborhoods still awaiting review;
- reviewed but unverified boundaries;
- verified boundaries ready to promote; and
- GPS-active promoted neighborhoods.

The safe operational meaning of **City Ready** is an aggregate status only. It must never bypass the per-neighborhood promotion gate.

## Fort Worth and Kansas City, Missouri

The current authoritative ingestion work supports the Fort Worth and Kansas City, Missouri sources already established in the repository. Administrators should promote only rows that have passed the explicit review and geometry-verification gates.

This preserves the distinction between:

- **authoritative geography** — eligible for GPS;
- **generated discovery hints** — informational only; and
- **user GPS** — the live signal used to select the user's current neighborhood.

## Compatibility

The application uses **Spirals** as the canonical product terminology. Existing Circle-era route aliases and internal compatibility names remain supported so existing links and data do not break.
