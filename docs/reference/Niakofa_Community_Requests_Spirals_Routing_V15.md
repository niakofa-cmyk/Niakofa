# Niakofa V15 hardening reference

This document records the V15 hardening package applied to the canonical
`artifacts/` source tree. The supplied reference archive was reviewed in full
before implementation.

- Reference archive SHA-256:
  `cd8bb3aa263d67bbd7cd7fdd82fdb74996c7c862991cbf5583f87ce1115fcc6a`
- Scope: Community, Requests, Spirals, civic completion, and task navigation.
- Canonical source: `artifacts/pay-it-forward` and `artifacts/api-server`.
- The archived `niakofa-repo/` mirror is not a source of truth.

## Applied decisions

### Requests

- Community now has a first-class Requests tab for open help, personal
  requests, active helping work, and completed work.
- `/requests` uses the same shared Requests Center instead of maintaining a
  separate browsing surface.
- Request discovery remains separate from Messages request conversations.
- Active helper work keeps the existing request route and navigation path;
  requesters and completed participants use the request detail surface.

### Spirals

- `CommunitySpiralsTab` is the single Community implementation.
- Curated neighborhood and city-wide Spiral discovery remains location
  independent. GPS presence is not used as an authorization or discovery
  requirement.
- Live status refreshes on demand and on a bounded 20-second interval.
- Live Spiral matching accepts the reviewed neighborhood ID and display name,
  and video capability is shown when the live session provides it.
- Existing Spiral routes and Circle compatibility aliases remain unchanged.

### Civic completion

- Completion is still atomic: the claimed row update and NET30 invoice are in
  one database transaction.
- A retry from the same claimant after a committed response loss returns the
  existing completion and invoice instead of creating a second invoice or
  returning a misleading conflict.
- A different user still receives the existing authorization/conflict result.
- Client completion errors display the server's actionable error message.

### Routing

- Server-side Mapbox Directions remains the only task-navigation route service.
- No client-side routing provider was introduced.

## Verification record

The final verification should run:

```text
pnpm --filter @workspace/api-server typecheck
pnpm --filter @workspace/pay-it-forward typecheck
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/pay-it-forward test
pnpm audit:routes
pnpm build
```

Authenticated browser acceptance must cover Community Requests, `/requests`,
Spirals including city-wide discovery and live status, civic claim/complete
and retry behavior, standard request navigation, Messages, and Hub-scoped
authorization. Production checks must use the canonical `https://niakofa.com`
origin and a private disposable authenticated state; they must not mutate
production data unless an approved disposable mutation path exists.