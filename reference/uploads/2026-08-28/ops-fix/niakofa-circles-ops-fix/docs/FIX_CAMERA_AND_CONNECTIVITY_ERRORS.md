# Fix: camera / mic / connectivity messages

Niakofa classifies failures in `circleMediaReadiness.ts`. Use this table.

## Message map

| User-facing message | Code | Real cause | What to do |
|---------------------|------|------------|------------|
| LiveKit is not configured on this environment | HTTP 503 | Missing `LIVEKIT_*` env | Set LiveKit Cloud/self-host secrets on API |
| Your microphone/camera opened, but the live connection to the Circle failed… | `connectivity_error` | LiveKit connect/publish/ICE/TURN/token failed **after** getUserMedia | Fix network, TURN, token, LIVEKIT_URL; not browser Site Settings |
| Allow camera/microphone access for Niakofa in your browser/site settings… | `permission_denied` | User/OS blocked getUserMedia | HTTPS origin; site settings; retry |
| No camera/microphone was found… | `device_not_found` | No hardware / wrong device | Plug in / enable device |
| The camera/microphone appears to be busy… | `device_busy` | Another app/tab holds the device | Close other apps; retry |
| Live camera/microphone access requires HTTPS… | `secure_context_required` | HTTP non-localhost | Serve app over HTTPS |
| Niakofa could not access the camera… | `unknown` | Unclassified | Check console; often permission or constraints |

## "Mic opened but live connection failed"

Means:

1. Browser **did** grant mic (local track OK).
2. Publishing or staying on **LiveKit** failed.

Checklist:

1. `LIVEKIT_URL` is `wss://…` and reachable from the phone (not only from your laptop).
2. API key/secret match that project URL.
3. Token mint succeeds (no 503/403/404 on `/media-token`).
4. Restrictive networks: enable LiveKit **TURN** (LiveKit Cloud includes TURN; self-host must configure).
5. Firewall allows outbound WSS 443 and WebRTC UDP/TCP as per LiveKit firewall docs.

## Video crashes audio?

Repo design: separate `micTrack` / `camTrack`; `enableCamera()` must not call `stopLocalMedia()`.

If audio still dies when video starts:

1. Confirm room uses `CircleRealtimeSessionManager.enableCamera()` (not a full re-join).
2. Confirm camera path uses `createLocalTracks({ audio: false, video: true })`.
3. On camera error, only unpublish/stop **camera** track.

## Listener video without host approval

Already coded when `media_publish_policy === "open"` (default). Token grant sets `canPublish` for listeners in open rooms. No host approval step required in product logic.

## Secure phone verification

On the real device:

1. App URL is **HTTPS** (`window.isSecureContext === true`).
2. User taps Allow on the permission prompt.
3. Settings → Safari/Chrome → site → Camera/Mic = Allow.
4. Not inside an insecure iframe without Permissions-Policy.
5. After local preview works, LiveKit must still connect (connectivity_error is separate).

## Zoom-class infrastructure (same class as Niakofa target)

- **SFU** (LiveKit) — one uplink, server forwards
- **TURN** for hard NATs / cellular
- **Short-lived room JWT** (Niakofa mints after auth + membership)
- **Control plane** (REST/WS) ≠ **media plane** (WebRTC)
- **Independent A/V tracks**
- **Reconnect**, not full page refresh
