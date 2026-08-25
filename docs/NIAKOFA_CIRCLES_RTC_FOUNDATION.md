# Niakofa Circles RTC foundation

Circles keeps REST and WebSocket lifecycle, roles, moderation, and recording metadata
on the Niakofa API. The media plane is currently browser-to-browser mesh; signaling
only relays offers, answers, and ICE and never carries audio/video.

## Certification gate

The room exposes a `CircleEnduranceCollector` that samples every 5 seconds. Export
the JSON from the room's diagnostics control after a real browser session. A screenshot
is not evidence. A release candidate needs:

- 60 minutes with one host, two speakers, and at least five listeners
- audio availability ≥99.9%; video availability ≥99.5% when expected
- a Wi-Fi/cellular interruption with recovery in ≤15 seconds typical and ≤30 seconds worst
- no unbounded heap growth between the first and last five minutes
- refresh/rejoin, mute/unmute, camera off/on, and TURN verification on mobile data
- four concurrent Circles with API/WebSocket load measured separately from media

Mesh is appropriate for small private Circles. Rooms above roughly 8 speakers or
40 listeners should use the transport seam and a managed SFU such as LiveKit. Do
not build an SFU into the Niakofa Node process. The LiveKit adapter is deliberately
an explicit not-configured boundary until token minting and an SFU deployment exist.