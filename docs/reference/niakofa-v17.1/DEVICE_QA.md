# V17.1 Real-device QA

Run this on an actual iPhone Safari and Android Chrome (or the closest real-device coverage available). Use a normal authenticated approved account for Community/Messages tests.

## A — Globe → Hub → Community

- [ ] Open `/diaspora`.
- [ ] Globe occupies the primary surface; no legacy dashboard clutter is restored.
- [ ] Tap a canonical country/state Hub marker.
- [ ] Hub drawer opens and remains inside the safe-area region.
- [ ] Tap **Community**.
- [ ] URL contains `hubId`.
- [ ] Community displays the selected-Hub context.
- [ ] Hub Community feed loads without requiring location permission.
- [ ] Member/open-request/gratitude counts render.
- [ ] Gratitude is Hub-scoped.
- [ ] Open request links reach `/request/:id/view`.
- [ ] No location-to-membership mutation occurs.

## B — Globe → Hub → Messages

- [ ] Return to `/diaspora` and select the same Hub.
- [ ] Tap **Message hub**.
- [ ] `/messages?mode=hub&sourceHub=...` opens.
- [ ] Hub source authorization behavior is unchanged.
- [ ] No second messenger page appears.
- [ ] `/diaspora/messages` still lands on the unified Messages surface.

## C — Globe → Hub → Spirals

- [ ] Select a Hub and tap **Spirals**.
- [ ] URL contains `hubId`.
- [ ] Spiral discovery remains curated/city-based.
- [ ] No GPS permission prompt is introduced by this path.
- [ ] No Hub membership is created by opening discovery.
- [ ] Community → Spirals retains the Hub context when `?tab=circles&hubId=...` is used.

## D — Direct Messages mobile

- [ ] Open `/messages?mode=direct`.
- [ ] Inbox is visible.
- [ ] Search for an approved person.
- [ ] Open a conversation.
- [ ] On mobile, the conversation becomes the full-screen content.
- [ ] Back returns to the inbox list.
- [ ] Browser/back navigation does not strand the user in an empty thread.
- [ ] Unread dot appears when applicable.
- [ ] Enter sends.
- [ ] Shift+Enter creates a new line.
- [ ] Composer remains usable while the thread scrolls.
- [ ] Bottom composer respects the device safe-area.
- [ ] Report and Block controls remain available.
- [ ] WebSocket live state and fallback behavior remain visible/functional.

## E — Requests

- [ ] Community → Requests tab opens.
- [ ] Open request → `/request/:id/view`.
- [ ] Accept/claim works in the normal test environment.
- [ ] Navigation opens through `/api/navigation/route`.
- [ ] En Route → Arrived → Complete remains available in order.
- [ ] Completion result is reflected after refresh.
- [ ] Retry after a successful completion does not create a false failure.

## F — Shell / responsive behavior

- [ ] No horizontal page overflow at 320–430px widths.
- [ ] No double bottom navigation.
- [ ] No second Messages surface.
- [ ] Globe drawer does not cover the browser/home indicator area.
- [ ] Message composer does not collide with the home indicator.
- [ ] Keyboard opening does not hide the send button.
- [ ] Back buttons have at least a comfortable touch target.
- [ ] Rotating the device does not leave a stale full-screen thread state.

## Evidence to capture

Record:

- device + OS + browser
- deployed commit SHA
- route URL at each checkpoint
- screenshots of Globe → Hub → Community
- screenshot of mobile Messages thread + Back
- screenshot of Hub → Spirals URL/context
- request completion result
- any console/network error

A V17.1 acceptance should not be marked complete from source review alone; the device paths above are intentionally part of the release gate.
