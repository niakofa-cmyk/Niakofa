# Niakofa location marker reference

This directory records the production decision for Niakofa's own-location
marker and the disposition of the supporting reference material reviewed on
September 26, 2026.

## Product contract

- `puck` is the persisted and rendered default.
- `spirit` is an explicit opt-in that renders the member's selected Spirit
  Animal companion.
- Missing or invalid preferences resolve to `puck`.
- Reduced-motion and battery/performance downgrade resolve to `puck`.
- A Spirit Animal render failure is contained and falls back to `puck`.
- The marker never changes the underlying coordinates or privacy-fuzzing
  behavior. A blue marker does not imply precise GPS.

## Reference material

The uploaded image, text notes, and Niakofa-specific ZIP packages remain in
`attached_assets/` as source references. The existing `docs/reference/`
library remains the canonical place for durable project notes and visual
baselines.

The Community Social Architecture and Community Stories packages were reviewed
as integration guidance only. Their recommendations are compatible with the
existing Niakofa Express, Drizzle, Postgres, unified Messages, and canonical
Community Stories boundaries; their duplicate Firebase/NextAuth/Flask/SQLite
architectures and any third-party media or credentials are not imported.

The Facebook-clone ZIPs are reference-only. Their branding, identity systems,
third-party media, credentials, and backend configuration are intentionally not
copied into Niakofa.