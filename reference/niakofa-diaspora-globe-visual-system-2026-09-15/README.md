# Niakofa Diaspora Globe Visual System

Reference package for the Globe-first Diaspora experience, based on the
uploaded desktop and mobile concept boards and the Diaspora hardening review.

## Product hierarchy

```text
Diaspora → Globe → Hub → Action
```

The `/diaspora` landing route answers one question: **Where is my community?**
It is not a second dashboard. Selecting a canonical Hub progressively reveals
Community, Message Hub, Spirals, Stories, Family, Pool, and local communities.

## Canonical geography

- Non-U.S. Globe Hubs represent countries: Ghana, Nigeria, Brazil, Jamaica,
  Canada, France, the United Kingdom, the Dominican Republic, and more.
- The United States is represented by individual state Hubs such as Texas,
  Georgia, California, and New York.
- Historical city/local Hubs remain durable records and appear in a selected
  Hub's local-community summary; they do not create independent Globe markers.
- Home is a user relationship or preference, never a Globe geography.

## Included visual references

- `desktop-globe-and-hubs.png` — Globe home, country Hub, state Hub,
  Hub-to-Hub messaging, live connections, and memory concepts.
- `mobile-experience.png` — welcome, Globe, Hub drawer, community feed,
  messaging, state browsing, search, stories, Spirals, and Pool concepts.
- `source-architecture-review.md` — uploaded architecture review preserved for
  future product and implementation decisions.
- `uploaded-hardening-package.zip` — original uploaded hardening package,
  retained as source reference. Its proposed `0138` migration was adapted to
  repository migration `0139` because `0138` is already durable Hub messaging.

## Current implementation mapping

| Concept | Production surface |
| --- | --- |
| Globe home | `/diaspora` and `DiasporaGlobeFirst` |
| Country/state markers | `GET /api/griot/village-pulse` canonical-only response |
| Local communities | `local_hubs` on the selected canonical Hub |
| Community | `/community?hubId=...` |
| Message Hub | Durable canonical Hub-pair conversation API and Globe drawer |
| Spirals | `/audio-circles?hubId=...` |
| Stories | Globe drawer's More menu |
| Pool | Globe drawer's More menu |

## Visual direction

- Deep teal/near-black space with teal activity markers and amber memory
  accents.
- Globe and Hub selection remain the dominant visual hierarchy.
- Use activity as restrained glow, pulse, rings, or connection lines; never
  turn the landing experience into a metrics dashboard.
- Keep primary Hub actions obvious and secondary capabilities behind
  progressive disclosure.
- Preserve large touch targets, visible focus states, readable contrast, and
  reduced-motion compatibility.

## Validation checklist

1. Brazil, Ghana, and Nigeria each render one canonical Globe marker.
2. Texas, California, and New York render as U.S. state Hubs.
3. Searching Recife resolves to the Brazil Hub's local-community summary.
4. Selecting a Hub exposes Community, Message Hub, and Spirals.
5. Stories and Pool remain behind More.
6. No Home Hub label or special Home marker appears.
7. The Globe endpoint does not emit grouped local rows or incomplete
   geography roots.
8. The mobile layout keeps search, marker selection, Hub actions, messaging,
   Stories, Spirals, and Pool usable without horizontal scrolling.