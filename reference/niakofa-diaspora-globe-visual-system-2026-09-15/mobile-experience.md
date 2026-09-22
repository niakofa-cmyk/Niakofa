# Niakofa Diaspora Mobile Experience Package

## Purpose

Provide full Diaspora access on the go without creating a second product
hierarchy. Mobile follows the same:

```text
Diaspora → Globe → Hub → Action
```

The responsive web artifact is the current implementation surface. This
document defines the mobile-ready interaction contract for a future native
artifact without duplicating server behavior or creating a second messaging
system.

## Mobile information architecture

### Bottom navigation

1. Home — global entry and recent activity
2. Diaspora — interactive Globe and Hub search
3. Circles — Spirals and live gatherings
4. Messages — Hub-to-Hub threads
5. More — Stories, Family, Pool, and account actions

The existing `/diaspora` page remains the canonical Diaspora tab. Native
navigation should deep-link into the same Hub IDs and API resources.

## Mobile screen contracts

### Welcome / Globe

- Show a focused Globe introduction and one primary “Explore Globe” action.
- Load canonical country/state Hubs only.
- Keep search available above the Globe.
- Use bottom-sheet Hub details on small screens.
- Preserve visible counts only as supporting context, not dashboard cards.

### Hub drawer

- Header: Hub label, geography type, and region.
- Supporting metrics: members, stories, Spirals, and open needs.
- Primary actions: Community, Message Hub, Spirals.
- Secondary actions in More: Stories, Family, Pool, Local communities.
- Use a full-height sheet when keyboard input or message history needs space.

### Hub-to-Hub messaging

- Select the sending Hub only from server-approved membership.
- Select any approved target Hub except the selected sending Hub.
- Reuse the durable canonical conversation pair.
- Enter sends; Shift+Enter inserts a line break.
- Show membership, empty, loading, failure, and retry states.
- Keep the 2,000-character message cap visible through native input limits.

### Search

- Search country labels, U.S. state labels, Hub names, country/state codes,
  and grouped local-community names.
- A local-city match opens its canonical parent Hub rather than a second
  Globe marker.
- Provide an explicit clear action and an empty result state.

### Stories, Spirals, and Pool

- Use the same Hub ID in deep links.
- Preserve existing permissions and financial safeguards.
- Never duplicate Pool accounting or create mobile-only ledgers.

## Mobile quality gates

- No horizontal scrolling at 320px, 375px, or 430px widths.
- Touch targets are at least 44px where practical.
- Keyboard does not obscure the message composer or send action.
- Focus order follows the visual hierarchy.
- Reduced-motion mode disables decorative pulses and connection animation.
- Offline or API failure states preserve navigation and provide retry.
- A native future client consumes the same API contracts; it does not invent
  client-owned Hub membership or ownership fields.