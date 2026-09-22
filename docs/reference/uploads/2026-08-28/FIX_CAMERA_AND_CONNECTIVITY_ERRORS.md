# Fix: camera, microphone, and connectivity messages

Niakofa distinguishes local device failures from media-plane failures:

| Code | Meaning | Action |
|---|---|---|
| `permission_denied` | Browser or OS blocked access | Use HTTPS, allow the site, retry |
| `device_not_found` | No usable hardware | Connect or enable the device |
| `device_busy` | Another app/tab owns the device | Close the other capture session |
| `secure_context_required` | Insecure origin | Use HTTPS (localhost is allowed in development) |
| `connectivity_error` | LiveKit connect/publish/ICE/TURN/token failed after capture | Check URL, token, TURN, and network |

After local mic or camera access succeeds, a connectivity error is not fixed
by changing browser site permissions. Check that production uses a reachable
`wss://` LiveKit URL, matching credentials, a working media-token route, and
TURN for restrictive networks.

Camera and microphone are separate LiveKit publications. Camera acquisition
uses a video-only request and may be denied, stopped, or recovered without
tearing down the microphone.

Before release, test two real devices over HTTPS: audio-only join, host camera,
listener camera in an open room, camera denial with audio retained, Wi-Fi or
cellular recovery, and hard-NAT/TURN behavior.