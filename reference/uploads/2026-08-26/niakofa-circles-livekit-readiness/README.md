# Niakofa Circles LiveKit readiness handoff

This reference records the uploaded `niakofa-circles-livekit-always-and-readiness`
handoff received on 2026-08-26 and the implementation boundary used for the
production Circles work.

## Preserved requirements

- Select LiveKit for every Circle; room size is not a safe proxy once listeners
  may publish video.
- Perform secure-context, media-API, and hardware checks without permission
  prompts before acquiring a device.
- Keep camera-only acquisition audio-free.
- Use one error taxonomy for permission, missing/busy hardware, constraints,
  unknown failures, and LiveKit/ICE/TURN connectivity failures.
- Keep genuine tests that import and exercise the readiness implementation.
- Keep the existing LiveKit-to-mesh fallback for environments that return HTTP
  503 because LiveKit is not provisioned.

## Source bundle

The original compressed handoff remains in the session upload area. The active
implementation is under `artifacts/pay-it-forward/`; the stale
`niakofa-repo/` mirror is not a source tree.