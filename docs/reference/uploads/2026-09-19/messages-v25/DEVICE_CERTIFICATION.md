# Messages V25 Device Certification

## iPhone Safari

Run on a physical iPhone using the current production URL.

- [ ] /messages opens without console/runtime error.
- [ ] Messages header fits the 720px-style narrow composition.
- [ ] Search field remains above keyboard.
- [ ] Ask Nia opens and streams a response.
- [ ] Story row scrolls horizontally.
- [ ] Story viewer opens and closes.
- [ ] Story composer publishes and refreshes.
- [ ] People tab shows approved users and active indicators.
- [ ] Direct conversation opens full-screen.
- [ ] Back returns to Messages home.
- [ ] Notifications opens from bottom navigation.
- [ ] Mark read / Mark all read persists after reopening.
- [ ] Community link returns to /community.
- [ ] Bottom navigation respects safe-area inset.
- [ ] Voice/video call controls are reachable and do not sit behind Safari chrome.

## Android Chrome

Repeat the complete iPhone checklist.

Additional checks:

- [ ] Android back gesture returns from a conversation to Messages home.
- [ ] Keyboard resize does not cover the composer.
- [ ] Pull/scroll gestures do not accidentally activate conversation actions.
- [ ] Story and notification sheets remain within viewport.

## Certification rule

Do not mark this document complete until a human has executed the checklist on the physical devices. Automated CI and Railway deployment success are not substitutes for physical-device certification.
