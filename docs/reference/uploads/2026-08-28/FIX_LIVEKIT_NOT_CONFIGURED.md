# Fix: “LiveKit is not configured on this environment”

The media-token endpoint returns HTTP 503 when any required server variable is
missing or invalid:

| Variable | Required production value |
|---|---|
| `LIVEKIT_URL` | `wss://...` |
| `LIVEKIT_API_KEY` | LiveKit Cloud or self-hosted API key |
| `LIVEKIT_API_SECRET` | Matching server secret |

Production rejects `http://`, `https://`, remote `ws://`, malformed URLs, and
URLs containing credentials. Local `ws://localhost` is for development only.

## Railway setup

1. Create or open a project at https://cloud.livekit.io.
2. Copy the project URL, API key, and API secret from Project Settings → Keys.
3. Add all three variables to the Railway API service.
4. Redeploy or restart the service.
5. Confirm `/api/readiness` reports LiveKit `ready`.
6. After authentication and Circle membership, confirm
   `POST /api/audio-circle-sessions/:id/media-token` returns `media_url`,
   `media_token`, `room_name`, and `can_publish`.

Never commit real keys or expose the API secret through a `VITE_*` variable.