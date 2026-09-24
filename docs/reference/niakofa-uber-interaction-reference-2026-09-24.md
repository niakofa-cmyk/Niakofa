# Niakofa request interaction reference

This note records the interaction patterns reviewed from the three uploaded Uber-style projects on September 24, 2026. The uploads are UX references only. They are not part of the Niakofa source tree, dependencies, data model, authentication, payments, maps, or realtime implementation.

## Patterns worth carrying forward

- **Map first, context second:** show the nearby request/helper signal on the map, then open a focused card or sheet for the selected item.
- **One compact action surface:** keep the primary next action visible in the contextual card rather than sending the user through a generic detail list first.
- **Role-aware live state:** requesters see helper identity, ETA, route, chat, and arrival confirmation; helpers see the requester, route, turn context, arrival action, and completion action.
- **Route and identity together:** the active surface pairs route geometry with the person and task context, not a route-only map.
- **Arrival is a real state:** arrival gets distinct status copy and an explicit handoff/completion step instead of being treated as another loading state.
- **Progressive sheets:** discovery, matching, en-route, and completed states use compact-to-expanded surfaces so the map remains usable.

## Niakofa-native expression

- `CommunityRequestDetailSheet` remains the map discovery sheet.
- `ActiveHelpCard` is the persistent map reminder for a claimed/en-route request.
- `HelperContextCard` and `NavigationContext` keep the helper’s active request legible while navigation is running.
- `ArrivalState` makes requester/helper arrival and completion distinct.
- `RequestConversationContext` composes the existing request card, live map, and `InAppChat`.
- Existing OpenAPI `HelpRequest` fields, privacy-fuzzed coordinates, shared WebSocket events, React Query cache, Mapbox routing, and authenticated REST remain authoritative.

## Deliberate exclusions

No Firebase, Google Maps, Expo/React Native, Clerk, Zustand, Uber-shaped database schema, alternate auth system, alternate payment system, or alternate realtime layer was adopted. The uploaded archives remain in the attachment area only and are not copied into GitHub.