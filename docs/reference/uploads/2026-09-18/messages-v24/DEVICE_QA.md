# Messages V24 real-device acceptance gate

This package adds the Hub feed/context wiring. The checklist below is an execution gate, not a claim that physical-device execution has already occurred.

## iPhone Safari
- [ ] Globe → canonical Hub → Community preserves `hubId`.
- [ ] Community → Messages opens `/messages?mode=hub&sourceHub=<id>`.
- [ ] Messages Hub context loads member/request/gratitude/post counts.
- [ ] Messages → Spirals opens `/audio-spirals?hubId=<id>`.
- [ ] Back navigation returns to the expected Hub/Community context.
- [ ] Mobile composer remains visible above the keyboard.
- [ ] Direct avatars/search/unread state render correctly.
- [ ] Direct voice/video call can be accepted and audio playback can be started after autoplay blocking.

## Android Chrome
- [ ] Repeat the same Globe → Hub → Community → Messages → Spirals path.
- [ ] Verify WebSocket reconnect restores Direct/Hub/request state.
- [ ] Verify call controls and camera/microphone permissions.
- [ ] Verify safe-area/viewport behavior.

## Evidence
Record:
- device + OS + browser version
- deployed commit SHA
- route at each checkpoint
- screenshots of Globe → Hub → Community → Messages
- screenshot of Hub context and Messages → Spirals
- console/network errors
- call result and autoplay result

## Release gate
Do not mark physical-device QA complete from static contract tests alone. A production release is device-certified only after the above checks are executed against the intended Railway deployment.
