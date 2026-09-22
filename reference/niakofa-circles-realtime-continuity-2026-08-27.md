# Niakofa Circles — realtime continuity handoff

## Source materials reviewed

The August 27, 2026 handoff was reviewed in full before editing:

- `attached_assets/Pasted-I-ll-first-inventory-the-current-workspace-read-both-do_1787888092182.txt`
- `attached_assets/Pasted-build-the-CircleRealtimeSessionManager-connect-reconnec_1787888106770.txt`
- `attached_assets/niakofa-circles-realtime-continuity_1787888137024.zip`

The ZIP contains the continuity specification, repository assessment, apply
notes, a first-pass session manager, and invariant tests. Those materials are
kept in `attached_assets/` for traceability. This file records the maintained
implementation boundary and verification evidence for the canonical
`artifacts/` source tree.

## Production media boundary

- REST and WebSocket remain the control plane for membership, roles,
  moderation, presence, chat, and recording state.
- LiveKit is the only Circle media transport. The browser connects to the
  short-lived URL/token returned by the media-token route.
- The `CircleRealtimeSessionManager` owns the LiveKit session lifetime,
  connection states, token renewal, bounded recovery, online/offline events,
  visibility recovery, and local media intent.
- Microphone and camera are separate LiveKit publications. Camera acquisition
  or publication failure must not stop a working microphone.
- React subscribes to manager callbacks. It does not create mesh peers,
  disconnect peer connections, or use REST resync as a media-health signal.
- Only metadata such as participant names, avatars, chat, and room policy may
  be cached. Live tracks, packets, and frames are never cached.

## Recovery contract

```text
LIVE → network/visibility interruption → RECONNECTING
     → fresh token + same Circle room identity → LIVE
```

Recovery never reloads the page. Concurrent starts and recovery signals share
one in-flight operation, retries use bounded exponential backoff with jitter,
and the manager republishes only the microphone/camera that the participant
had requested. A failed re-publication is reported independently by device.

The token scheduler uses the server-provided `expires_in` value and refreshes
at 80% of the lifetime. The one-minute minimum delay is a production safety
floor and is injectable in tests.

## Automated verification

Run from the repository root:

```bash
pnpm run typecheck:libs
pnpm --filter @workspace/pay-it-forward typecheck
pnpm --filter @workspace/pay-it-forward test
pnpm --filter @workspace/pay-it-forward build
```

The A–G suite is:

| Test | Contract | Result |
| --- | --- | --- |
| A | Host audio reaches a listener through `LiveKitCircleTransport` | Pass |
| B | Host camera publication preserves host audio | Pass |
| C | Open Circle listener can publish video without approval | Pass |
| D | Camera permission denial preserves microphone and reports a classified camera error | Pass |
| E | Network interruption rejoins the same Circle identity | Pass |
| F | Visibility return recovers without a page reload | Pass |
| G | Audio/video device switching preserves the other media track | Pass |

The suite instantiates the production `LiveKitCircleTransport` adapter and
uses its injected SDK-room/capture seams to create a deterministic,
two-participant in-process LiveKit-shaped network. It is real adapter
integration coverage, not a claim that CI packets crossed a hosted SFU, TURN
server, NAT boundary, or physical device.

Real-browser/device certification is still required for production sign-off:
permission prompts, camera hardware, mobile lock/unlock, Wi-Fi/cellular
interruption, TURN/NAT paths, and a four-person room remain external gates.