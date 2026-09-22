# Niakofa Circles — RTC Hardening Package

This package hardens the Circle realtime media plane without page refreshes or media caching.

## Guarantees

1. **One authoritative media plane:** LiveKit/SFU is the production Circle transport.
2. **Audio/video isolation:** camera acquisition, publication, failure, and recovery do not tear down an active microphone publication.
3. **No page refresh recovery:** a lost media transport is recreated for the same Circle session by `CircleRealtimeSessionManager`.
4. **Bounded reconnects:** recovery uses exponential backoff, jitter, and a shared recovery promise to prevent reconnect storms.
5. **Token lifecycle:** media tokens are refreshed before expiry and 429/5xx requests use bounded retry/backoff.
6. **Browser lifecycle:** online/offline and visible/hidden transitions are observed.
7. **Listener camera:** an authorized participant may publish video when the Circle media policy is open; host approval is not required for the media publication itself.
8. **Typed camera diagnostics:** permission, missing device, busy device, unsupported constraints, secure-context failure, and connectivity errors are separated.
9. **Health watchdog:** `CircleRtcHealthMonitor` requires consecutive lost observations before requesting recovery, avoiding recovery from a single transient state.

## The 4–5 second on/off failure

The health monitor intentionally does **not** treat a single `lost` observation as a reason to reconnect. For a real 4–5 second oscillation, production diagnostics must capture:

- LiveKit `ConnectionState`
- browser `RTCPeerConnection.iceConnectionState`
- selected ICE candidate type (`host`, `srflx`, `relay`)
- RTT, jitter, packets lost and bytes sent/received
- local publication state for microphone and camera
- remote subscription state
- media-token HTTP status and latency
- whether the connection used TURN/relay

If the browser opens the microphone/camera successfully but the LiveKit session drops, investigate the media network path before changing browser permissions.

## Production topology

```text
Browser
  | HTTPS / WSS / WebRTC
  v
Niakofa API --------------------> Redis / rate limits / Circle state
  |
  | short-lived media token
  v
LiveKit SFU
  ^
  |
  +---- ICE/STUN ---- direct path when possible
  |
  +---- TURN -------- relay path when direct connectivity fails
```

The API must never proxy the live audio/video packets.

## Browser requirements

- Production page must be HTTPS.
- LiveKit media URL must be `wss://...` in production.
- Camera/microphone permissions must be granted for the exact origin.
- The device must have an available, non-busy camera/microphone.
- Safari/iOS and Android Chrome must be tested independently; desktop Chrome is not sufficient certification.

## Required real-device certification

Before calling Circles production-ready, test a real deployed LiveKit environment with at least:

- iPhone Safari ↔ desktop Chrome
- Android Chrome ↔ desktop Chrome
- Wi-Fi ↔ Wi-Fi
- Wi-Fi ↔ cellular
- cellular ↔ cellular
- temporary network loss and recovery
- browser background/foreground
- camera permission denial
- camera already in use
- microphone permission denial
- camera device switch
- microphone device switch
- two or more simultaneous camera publishers
- 30–60 minute Circle endurance run

The repository's Node integration tests validate the media contract but cannot prove Internet/TURN/SFU behavior.

## Expected UI states

```text
🟢 LIVE
🟡 RECONNECTING…
🔴 CONNECTION LOST — retrying automatically

🎤 Audio: LIVE
📹 Video: RECONNECTING
```

A camera failure should never replace a healthy audio state with a generic room failure.

## 429 protection

The media-token route is protected by its existing server-side authentication, Circle authorization, and rate limiting. The client must not poll the token endpoint on a fixed short interval. Only initial connection, bounded recovery, and token renewal should request a media token.

For large scale, scale the API and LiveKit separately. Millions of users should not translate into millions of API requests per second for live media packets.
