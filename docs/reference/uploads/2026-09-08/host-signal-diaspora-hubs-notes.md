# Niakofa Host Signal and Diaspora Hub reference

These notes preserve the product contract from the uploaded September 2026
review material used for this build pass. The uploaded material contained five
plain-text audit snapshots; no ZIP archive was present in the workspace.

## Host Signal and Spirals

- A fresh, accurate GPS fix is used to reverse-geocode the user's city.
- A neighborhood is shown only when a reviewed polygon or radius matches the
  point. Niakofa must not guess a neighborhood from an unreviewed hint.
- The verified current-neighborhood Spiral is first in the Spirals list.
- Other neighborhood Spirals follow, and the city-wide Spiral remains last.
- The same reviewed geometry must protect both the location-check endpoint and
  the direct start endpoint; joining never requires GPS.
- Host eligibility is separate from Diaspora Hub membership.

## Diaspora Hubs and stories

- Diaspora Hub membership is an explicit community relationship, not automatic
  GPS enrollment.
- Hub live presence is an aggregate, fresh-GPS signal inside the Hub's
  operational radius; raw coordinates, names, and user IDs stay private.
- Stories should be attached to an explicit Hub ID when available, while the
  legacy place label remains a compatibility fallback.
- The Globe should call the place rail **Diaspora Hubs**, and display Members,
  Live, Stories, Helping, Neighborhoods, Spirals, and Pool as distinct metrics.

## Production guardrails

- The authenticated village pulse is private and uncached.
- Pool settlement metadata updates must use explicitly typed SQL parameters.
- Production claims require a running build and exact GitHub commit parity; a
  repository merge alone is not proof of a deployed authenticated flow.