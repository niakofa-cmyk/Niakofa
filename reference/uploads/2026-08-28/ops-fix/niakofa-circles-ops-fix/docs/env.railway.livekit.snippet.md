# Append to Railway variables / `.env.railway.example`

```bash
# ── LiveKit (Circles media plane) ───────────────────────────────────────────
# Required for live audio/video. Without these, POST /media-token returns 503
# "LiveKit is not configured on this environment".
#
# LiveKit Cloud: https://cloud.livekit.io → Project Settings → Keys
# URL must be wss:// in production (ws://localhost only for local dev).
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud          # [RUNTIME]
LIVEKIT_API_KEY=APIxxxxxxxx                            # [SECRET][RUNTIME]
LIVEKIT_API_SECRET=secretxxxxxxxx                      # [SECRET][RUNTIME]
```

Optional self-host notes:

- Configure TURN for mobile/cellular participants.
- Never put API secret in `VITE_*` frontend env (server-only).
