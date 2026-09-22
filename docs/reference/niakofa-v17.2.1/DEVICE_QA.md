# Niakofa V17.2.1 device acceptance

Test on iOS Safari and Android Chrome where available.

## Globe and Hub context

- Select a canonical country or U.S.-state Hub and open Community.
- Confirm the Hub identity, gratitude, counts, and open requests stay scoped.
- Open Spirals and confirm `hubId` is preserved.
- Open the full Spiral directory and confirm Hub context is not silently lost.
- Confirm curated discovery does not request GPS permission.

## Messages

- Hub messaging opens the unified `/messages` product in Hubs mode.
- Direct messaging remains available from Community.
- On mobile, list → thread → Back returns to the inbox.
- Avatars, search, unread state, Enter-to-send, and block/report remain usable.
- The keyboard does not cover the composer.

## Requests and Civic Needs

- Community Requests retains Open, My Requests, Helping, and Completed.
- Exercise Open → Accept/Claim → En Route → Arrived → Complete.
- Civic Mark Complete shows the server error text for a persistent failure.
- A transient 5xx followed by success confirms completion without a duplicate
  invoice.

## Navigation and shell

- `/api/navigation/route` remains the Mapbox route endpoint.
- Safe-area insets, scrolling, and the mobile shell remain intact.
- No duplicate messaging or routing implementation appears.