---
name: Niakofa Audio Circles — complete fix inventory
description: All 10 confirmed bugs in Audio Circles fixed July 19 2026; patterns to follow when extending the feature.
---

## Fixes applied (July 19 2026)

### WebRTC (audioCircleWebRTC.ts)
- **ICE candidate buffering** — `pendingIce: Map<number, RTCIceCandidateInit[]>` per peer.
  ICE candidates that arrive before `setRemoteDescription` are queued and flushed
  immediately after offer/answer processing. Without this, `addIceCandidate` throws
  `InvalidStateError` and the peer never connects.
- **`onLocalStream` callback** — added to constructor opts; room UI wires a `<video>` ref.
- **`addStreamToMixIfRecording(stream)`** — new speakers who arrive mid-recording are added
  to the WebAudio mix without stopping/restarting the MediaRecorder.
- **`setRecording(enabled): Blob | null`** — unified start/stop; returns the Blob on stop.
- **`recvonly` transceivers for listeners** — ensures listeners can create a valid offer with
  media sections even when they have no local tracks; avoids renegotiation failures.
- **More STUN servers** — Google (4) + Cloudflare (1) for better NAT traversal diversity.

### Room UI (audio-circle-room.tsx)
- **Video rendering** — `<video ref={wireRemoteVideo(userId, el)}>` for each speaker with video
  tracks. `wireRemoteVideo` is a callback ref that keeps `remoteVideoRefs.current` in sync;
  a `useEffect` re-runs on `remoteStreams` change to attach streams to already-mounted elements.
- **Local video preview** — `<video ref={localVideoRef} autoPlay muted playsInline>` mirrors
  the camera (scale-x: -1) for selfie view. Updated by a `useEffect` watching `localStream`.
- **Recording wired to mesh** — `circle_recording_changed` WS handler calls
  `meshRef.current?.setRecording(is_recording)` on the host's client; Blob returned on stop
  is stored in `pendingRecordingBlob` state and offered as a download.
- **Mute sync** — `toggleMic()` calls `POST /mute` after toggling the track; `circle_muted_changed`
  handler updates participant list so other users see the correct mic indicator.
- **Speaking ring animation** — unmuted speakers get a `animate-ping` ring on their avatar
  (pure CSS, no Web Audio API polling).
- **WS signal bridge** — `signalHandlerRef` + `useWebSocket("circle_signal", ...)` bridge;
  the mesh is a plain class and can't use React hooks, so the ref holds the handler.

### API (audio-circles.ts)
- **`broadcastToAuthenticated` on session start** — payload includes `city_key` so the list
  page can filter before calling `refresh()`.
- **`broadcastToAuthenticated` on session end** — in `endSessionInternal`, sends to ALL
  authenticated users so the list page reflects the ended session immediately.
- **`POST /audio-circle-sessions/:id/mute`** — updates `muted` column + broadcasts
  `circle_muted_changed` to all active participants.

### WS types
- `circle_muted_changed` added to `WsEventType` in **both** `ws-hub.ts` and `wsClient.ts`.
  These two files must always stay in sync — missing a type in wsClient.ts causes silent
  handler failures (useWebSocket callback never fires).

### List page (audio-circles.tsx)
- `useWebSocket("circle_session_started")` + `useWebSocket("circle_session_ended")` both
  call `refresh()` immediately. `circle_session_started` filters by `city_key` to avoid
  spurious refreshes when other cities' circles go live.

### Tests
- `audio-circles.test.ts` mock: always add `broadcastToAuthenticated: jest.fn()` alongside
  the other ws-hub mocks — forgetting it causes `SyntaxError: no export named` at test import.

**Why:** ICE buffering was the #1 WebRTC reliability bug; video was completely invisible
(no `<video>` elements in JSX); recording never started (mesh method not called); the list
page only updated every 15 seconds without the WS subscriptions.
