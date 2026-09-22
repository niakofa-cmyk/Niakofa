# Diaspora Globe Visual Gap Matrix — 2026-09-16

This matrix compares the current repository with the supplied Globe/mobile concepts.

## A. Landing / Globe

| Concept behavior | Current state | V2 |
|---|---|---|
| `/diaspora` is Globe-first | Implemented | Preserve |
| Globe is the main visual hierarchy | Implemented | Preserve |
| Country Hubs worldwide | Implemented | Preserve |
| U.S. Hubs by state | Implemented | Preserve |
| Local/city Hubs nested under parent | Implemented | Preserve |
| Home Hub as geography | Removed from current Globe | Preserve removal |
| Search country/state/local Hub | Implemented | Preserve |
| Search selection flies to location | Missing | Added |
| Clicked marker flies/focuses location | Partial | Added |
| Selected marker has stronger visual state | Missing | Added |
| Country/state flag identity in marker | Minimal | Added |
| Zoom controls | Not explicit in current Globe | Added |
| Compass/navigation control | Not explicit in current Globe | Added |
| Fake connection arcs | Not implemented | Intentionally not added |

## B. Hub drawer

| Concept behavior | Current state | V2 |
|---|---|---|
| Hub type | Implemented | Preserve |
| Region | Implemented | Preserve |
| Members/stories/Spirals/open needs | Implemented | Preserve |
| Crisis state | Implemented | Preserve |
| Community | Implemented | Preserve |
| Message Hub | Implemented | Preserve |
| Spirals | Implemented | Preserve |
| Stories behind More | Implemented | Preserve |
| Pool behind More | Implemented | Preserve |
| Local communities visible | Implemented | Make actionable |
| Bottom sheet above mobile navigation | Implemented | Preserve |

## C. Hub-to-Hub messaging

| Concept behavior | Current state | V2 |
|---|---|---|
| Select source Hub from approved membership | Implemented server-backed | Preserve |
| Select target Hub | Implemented | Preserve |
| Durable conversation pair | Implemented | Preserve |
| Message history | Implemented | Preserve |
| Enter sends / Shift+Enter newline | Implemented | Preserve |
| 2,000 character cap | Implemented | Preserve |
| Loading/error/empty states | Implemented | Preserve |
| Full-height mobile composition | Partial | Hardened |

## D. Mobile

The repository's mobile package explicitly defines:

```text
Home → Diaspora → Circles → Messages → More
```

The current application shell does not literally expose that five-item IA. Its consumer bottom navigation currently contains Community, Map, Diaspora, and Spirals; Hub messaging is contextual from the Globe drawer.

Therefore:

- the **Diaspora interaction model** is substantially implemented responsively;
- the **exact five-item mobile shell shown in the concept** is not yet a literal match.

This package does not rewrite the global application navigation because that would be a broader product-shell change.

Mobile Globe requirements already addressed in the repository include:

- 44px-ish marker target
- 44px search clear target
- drawer positioned above bottom navigation
- short-screen height hardening
- reduced-motion marker behavior

## E. Live presence / relationships / memory

The old standalone concepts are no longer intended to compete on `/diaspora`.

Their capabilities should live behind Hub context:

- Live Diaspora Presence → Hub activity / Live now
- Real relationships behind the Globe → Community / Connections
- Alive from member to Spiral → Hub → Spirals
- See where your family's Memory lives → Hub → Stories / Family
- Hub-to-Hub communication → Message Hub / Messages
- Pool → Hub → More → Pool

The repository still contains the older `GlobalVillagePulse`, live-presence, and legacy Globe surfaces. They should be treated as downstream/legacy surfaces rather than restored to the `/diaspora` landing page.

## F. Visual behaviors that remain intentionally data-dependent

The concepts show:

- glowing connection lines
- live gathering cards
- rich memory visualization
- dense activity overlays
- large global statistics panels

The current Globe should not fabricate these.

When real data contracts exist, they can be introduced as contextual overlays or optional Globe layers. Until then, the cleaner Globe-only experience is the safer product behavior.
