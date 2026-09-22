# Self-hosted TURN server for Circles (free-tier path)

This is a legacy TURN fallback for the retired browser-mesh transport. The
production Circle/Spiral room uses LiveKit as its media plane; keep this
document only for compatibility work or a deliberate future transport change.

Related code (already merged, works with or without this being set up):
- `artifacts/api-server/src/routes/webrtc-ice.ts` — mints short-lived TURN
  credentials from the shared secret you set up below. Falls back to
  STUN-only automatically if this isn't configured — nothing breaks in the
  meantime.
- The active LiveKit transport does not call this endpoint. Do not wire TURN
  credentials into the production room unless the media architecture changes.

## 1. Get a free VPS with a public IPv4 address

Any of these work; pick whichever you already have an account with:
- **Oracle Cloud "Always Free"** — includes small always-free compute
  instances with a public IP. Most generous free tier for this use case.
- **Fly.io** — has a free allowance; needs a Fly app configured for raw
  UDP, which is a bit more involved than a plain VM.
- Any $4–6/mo VPS (Hetzner, DigitalOcean, Linode) if you'd rather not deal
  with free-tier limits — still far cheaper than managed TURN at scale.

You need: a public IPv4 address, Docker installed, and the ability to open
UDP ports in whatever firewall/security-group layer sits in front of it
(cloud provider firewall AND the OS firewall, e.g. `ufw` — both must allow
the ports below, not just one).

## 2. Open the required ports

- `3478/udp` and `3478/tcp` — TURN control
- `49152–49252/udp` — relay data (matches `min-port`/`max-port` in
  `turnserver.conf`; narrow or widen the range there if you change it here)

## 3. Configure and start coturn

```bash
# On the VPS, in this directory (infra/turn/):
openssl rand -hex 32   # generate a secret, copy the output

# Edit turnserver.conf:
#   - external-ip       → this VPS's public IP (curl ifconfig.me to check)
#   - static-auth-secret → the secret you just generated

docker compose up -d
docker compose logs -f   # confirm it started with no errors, then Ctrl-C
```

## 4. Configure the API server (Railway) with the matching secret

In Railway's dashboard, on the `api-server` service, add these environment
variables:

| Variable | Value |
|---|---|
| `TURN_URL` | `turn:<vps-public-ip>:3478` |
| `TURN_STATIC_AUTH_SECRET` | the exact same secret from step 3 |

(If you later add a TLS TURN listener, `TURN_URL` can be a comma-separated
list, e.g. `turn:<ip>:3478,turns:<ip>:5349` — `webrtc-ice.ts` splits on
commas and returns all of them.)

**Do not** set `VITE_TURN_URL`/`VITE_TURN_USERNAME`/`VITE_TURN_CREDENTIAL`
anywhere — those are the old, removed approach and are no longer read by
the frontend.

Redeploy the API server after adding the vars (Railway does this
automatically on env var changes for most projects, but double check).

## 5. Verify

Once deployed, hit the endpoint directly (with a real auth token) to
confirm a TURN entry comes back:

```bash
curl -s https://niakofa.com/api/webrtc-ice-servers \
  -H "Authorization: Bearer <a-real-user-token>"
```

You should see two STUN entries plus one `turn:` entry with a `username`
and `credential`. If you only see STUN entries, either `TURN_URL` or
`TURN_STATIC_AUTH_SECRET` isn't set on Railway, or the API server hasn't
picked up the new env vars yet (redeploy).

Then join a live Circle from two devices/networks known to be hard for
plain STUN (e.g. one on cellular data) and confirm audio connects.

## Notes on scale

This single coturn instance is fine for the traffic Circles generates
today. If Circles usage grows significantly, the two things to revisit
are (a) `max-bps`/`total-quota`/`user-quota` in `turnserver.conf`, and
(b) eventually running more than one coturn instance behind a shared
secret (any of them can validate any credential minted with the same
secret, so this is cheap to scale out later without an app code change).
