# Niakofa Diaspora Globe reference

This reference records the reviewed V6 and V7 hardening packages supplied for
the Niakofa app. The original uploaded archives remain in `attached_assets/`;
the implementation below is intentionally adapted to the current canonical
`artifacts/` source tree rather than copied blindly.

## Product contract

`Diaspora → Globe → Hub → Action`

- `/diaspora` is the canonical Globe entry point.
- `/globe` and `/diaspora/heritage/globe` remain compatibility routes that
  render the same Globe-first surface.
- Country Hubs are canonical outside the United States; U.S. states are the
  canonical U.S. exception. Local/community Hubs remain contextual children.
- Location, account identity, Hub membership, representation, and leadership
  are separate concepts.

## V6 findings retained

- Keep Globe discovery quiet: selected-Hub actions contain Community, Message
  Hub, Spirals, Stories, Family, Pool, and local communities.
- Do not fabricate movement arcs, global statistics, or authoritative imagery.
- Mobile Globe uses touch-sized controls, a safe-area-aware bottom drawer, and
  query-preserving Hub links.

## V7 implementation retained

- `hub_memberships` is the first-class authorization primitive.
- Existing community-linked users and approved Hub leaders are backfilled as
  approved memberships.
- Hub-to-Hub reads and writes require approved membership in a participating
  Hub; physical location alone never grants representation.
- `/diaspora/messages` is the global destination for durable Hub conversations.
- `?hub=ID` and `?hubName=NAME` select the matching Hub on `/diaspora`.

## Source packages reviewed in full

- `Niakofa_Diaspora_Globe_V6_Hub_Context_Hardening_(1)_1789609731038.zip`
- `Niakofa_Diaspora_Globe_V7_Hub_Membership_and_Routing_Hardening_1789609725365.zip`
- The two attached current-main review reports supplied with this change.

The package scripts were treated as review material. No uploaded script was
executed against the workspace or any production database.