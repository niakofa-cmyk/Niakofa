# Niakofa Circles — LiveKit SFU reference

This reference records the uploaded `niakofa-circles-livekit-sfu` package
received on August 25, 2026. The original archive remains in
`attached_assets/` for provenance; its source files were reviewed in full and
the production implementation is integrated into the Circles workspaces.

## Contract

- Niakofa REST/WS remains the control plane for joining, roles, moderation,
  recording state, and chat.
- LiveKit is the media plane. The server mints a short-lived,
  room-scoped token only after authentication, approval, and an active
  participant check.
- Mic and camera are separate LiveKit publications. Camera failure or
  removal must not republish or tear down the microphone.
- Media acquisition is serialized and cancellation-aware, so rapid toggles or
  teardown cannot publish a track after the room has ended.
- Recording cleanup is idempotent and handles an inactive recorder or recorder
  error without leaving browser audio resources open.
- Missing LiveKit configuration is an explicit `503`; the client must retain
  mesh fallback rather than retry-looping.
- `open` media policy permits all active roles to publish; `moderated` permits
  host, co-host, and speaker only.

## Deployment

Use LiveKit Cloud or self-host with the reviewed files under the uploaded
archive's `infra/livekit/` directory. Configure `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` as deployment secrets. Never put
real keys in the repository or the self-hosted YAML.

## Verification checklist

1. Run the web and API typechecks and builds.
2. Run the Circle media policy, transport, and media configuration tests.
3. Test on two real devices: audio first, camera on/off, denied camera
   permission, cellular-to-Wi-Fi relay, and reconnect.
4. Confirm `503` configuration fallback in an environment without LiveKit.