# Fix: "LiveKit is not configured on this environment"

## What it means

The API route `POST /api/audio-circle-sessions/:id/media-token` returns **503** when any of these is missing or invalid:

| Variable | Required value |
|----------|----------------|
| `LIVEKIT_URL` | `wss://...` (production) or `ws://localhost` / `ws://127.0.0.1` (dev only) |
| `LIVEKIT_API_KEY` | LiveKit Cloud project API key (or self-hosted key) |
| `LIVEKIT_API_SECRET` | Matching API secret |

Source (repo):

```ts
if (!apiKey || !apiSecret || !livekitUrl || !isValidLiveKitUrl(livekitUrl)) {
  return res.status(503).json({ error: "LiveKit is not configured on this environment" });
}
```

`isValidLiveKitUrl` **rejects**:

- `https://` or `http://` (must be `wss:` or local `ws:`)
- Remote `ws://` (mixed content / insecure)
- URLs with username/password in them
- Malformed URLs

## This is not a browser or camera bug

If you see this message, the phone camera is irrelevant until LiveKit secrets are set on the **API server** (Railway / host environment).

## Fix (LiveKit Cloud — recommended)

1. Create a project at [https://cloud.livekit.io](https://cloud.livekit.io).
2. Open **Settings → Keys**. Copy:
   - Project URL → `LIVEKIT_URL` (looks like `wss://your-project.livekit.cloud`)
   - API Key → `LIVEKIT_API_KEY`
   - API Secret → `LIVEKIT_API_SECRET`
3. In **Railway → your API service → Variables**, add all three.
4. Redeploy the API service (env changes require restart).
5. Verify:

```bash
# After login cookie/token is available:
curl -sS -X POST "$API_URL/api/audio-circle-sessions/SESSION_ID/media-token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

Expect JSON with `media_url`, `media_token`, `room_name`, `can_publish` — **not** 503.

## Fix (local dev)

```bash
# Terminal A — LiveKit server in dev mode
livekit-server --dev
# API Key: devkey   API Secret: secret   URL: ws://localhost:7880

# Terminal B — API env
export LIVEKIT_URL=ws://localhost:7880
export LIVEKIT_API_KEY=devkey
export LIVEKIT_API_SECRET=secret
```

## Railway example block (add to service variables)

```
LIVEKIT_URL=wss://YOUR_SUBDOMAIN.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxx
```

Never commit real keys. Add the block to `.env.railway.example` as placeholders only (see companion file in this package).

## After config is fixed

Flow becomes:

```
Join Circle (REST)
  → POST /media-token (JWT)
  → LiveKit Room.connect(wss, token)
  → publish mic / camera tracks
  → SFU fans out to listeners
```

Without the three env vars, Circles can still do REST/WS presence, but **live media cannot start**.
