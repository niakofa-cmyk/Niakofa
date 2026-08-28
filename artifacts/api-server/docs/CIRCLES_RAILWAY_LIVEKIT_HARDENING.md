# Niakofa Circles — Railway + LiveKit Hardening

## Production topology

```text
Browser / phone
  -> HTTPS Niakofa API on Railway
  -> short-lived LiveKit access token
  -> wss:// LiveKit endpoint
  -> WebRTC ICE/STUN/TURN
  -> LiveKit SFU
```

Railway should serve the API/token plane. It should **not** proxy Circle audio/video through Express.

## Required Railway variables

Set these as **Railway service variables**, never in Git:

```text
NODE_ENV=production
SESSION_SECRET=<32+ random characters>
ALLOWED_ORIGIN=https://<your-niakofa-frontend>
LIVEKIT_URL=wss://<your-livekit-host>
LIVEKIT_API_KEY=<server key>
LIVEKIT_API_SECRET=<server secret>
```

Do not expose `LIVEKIT_API_SECRET` or any Railway credential to the browser.

## Verification endpoints

After deployment:

```text
GET /healthz
GET /health
GET /livekit-readiness
```

`/healthz` is the Railway deployment probe. `/livekit-readiness` performs a bounded server-side LiveKit API authentication check and returns only safe configuration information plus the active-room count.

## What `/livekit-readiness` proves

A `200` response means:

1. `LIVEKIT_URL` is syntactically valid.
2. Production is using `wss://`.
3. API key and secret are present.
4. Railway can reach the LiveKit server API.
5. LiveKit accepted the server credentials.

It does **not** prove that a particular phone can establish a WebRTC media path. That requires a real browser/device test through ICE/STUN/TURN.

## Circle recovery policy

The browser watchdog must:

- observe LiveKit `connected`, `connecting`, `reconnecting`, and `disconnected` states;
- tolerate transient disconnects;
- require consecutive failures before recovery;
- enforce a recovery cooldown;
- call the existing Circle session manager's `recover()` method;
- never reload the page;
- never create a second Circle room;
- never tear down a healthy microphone just because the camera fails.

## 4–5 second dropout investigation

For the reported periodic dropout, test in this order:

1. `/livekit-readiness` from Railway.
2. Host on Wi-Fi, audio only.
3. Host turns camera on.
4. Listener subscribes to audio/video.
5. Repeat from a phone on cellular.
6. Test Wi-Fi -> cellular and cellular -> Wi-Fi.
7. Confirm TURN is available for restrictive/cellular networks.
8. Capture LiveKit `ConnectionStateChanged`, `Disconnected`, and browser ICE/peer-connection state around the exact dropout.

A successful `getUserMedia()` call only proves local device access; it does not prove the WebRTC media path is healthy.

## 429 protection

The media-token endpoint must not be polled every few seconds. A Circle session should obtain one initial token and reuse the active LiveKit session. Recovery should be bounded and coalesced. Refresh/reissue only when a full reconnect actually requires it.

## Railway deployment

`railway.json` configures:

- `/healthz` as the deployment healthcheck;
- a 60-second healthcheck timeout;
- `ON_FAILURE` restarts with up to 10 retries.

Railway healthchecks are deployment readiness checks, not continuous monitoring. Use application telemetry/monitoring for ongoing Circle RTC health.

## Real-device certification gate

Do not label Circles production-ready until all of these pass:

- iPhone Safari — audio
- iPhone Safari — audio + camera
- Android Chrome — audio
- Android Chrome — audio + camera
- desktop Chrome
- desktop Safari
- permission denied camera while audio remains live
- camera busy while audio remains live
- Wi-Fi interruption/recovery
- cellular interruption/recovery
- Wi-Fi <-> cellular transition
- browser background/foreground
- multiple simultaneous video publishers
- 30–60 minute endurance session

The simulated LiveKit tests validate application contracts. They do not replace this real-device certification.
