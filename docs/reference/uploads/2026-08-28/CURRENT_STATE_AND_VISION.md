# Niakofa Circles — current public repo state (August 2026)

Repo: https://github.com/niakofa-cmyk/Niakofa

## Architecture

```text
Phone/Browser
  → HTTPS Niakofa API (auth, membership, media-token JWT)
  → WSS LiveKit SFU
  → Host / Speakers / Listeners
```

| Requirement | Status |
|---|---|
| Formal realtime media system | LiveKit media plane + REST/WS control plane |
| LiveKit for every Circle size | Yes |
| Listener video without host approval | Yes when policy is `open` |
| Independent mic/camera | Yes |
| Continuity without full refresh | `CircleRealtimeSessionManager` |
| Rate-limit scale model | User-keyed + Redis-aware |
| LiveKit env documented for Railway | Yes |
| Production LiveKit secrets | Deployment operation still required |
| Physical-device certification | Still required on HTTPS and real phones |

Do not rebuild the media plane as a browser mesh. Configure LiveKit, keep
continuity and device UX hardening, and complete real-device certification.

## Immediate priority

1. Set the three `LIVEKIT_*` variables on the production API.
2. Confirm `/media-token` returns a room-scoped JWT.
3. Test microphone, camera, denied permission, reconnection, and TURN paths.