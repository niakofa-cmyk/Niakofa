# Railway LiveKit variables

```bash
# Required for live audio/video. Without these, /media-token returns 503.
LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxx
```

Use placeholders in documentation only. Set the actual values as Railway
service variables. `LIVEKIT_API_SECRET` is server-only and must never be put in
the frontend build environment.