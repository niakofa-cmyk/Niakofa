# Niakofa Circles — certification runbook

This runbook is the release gate for the Circles real-time audio/video system.
It complements the implementation specification at
`reference/niakofa-circles-realtime-media-spec-2026-08-24.md`.

## Automated checks

Run these checks from the repository root:

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server run test
node scripts/src/release-smoke.mjs
```

The smoke gate must be run with both the web and API workflows serving, or with
`NIAKOFA_WEB_URL` and `NIAKOFA_API_URL` pointing at the same release candidate.
It verifies the SPA shell, public health probes, and unauthenticated `401`
boundaries for Circles session resync and WebRTC ICE credentials.

## Real-browser certification matrix

Automated route coverage cannot prove that media crosses a real NAT path. Run
the following with two current browsers on separate devices or profiles, using
a provisioned TURN server when the networks are not directly reachable. Record
the date, browser versions, network types, session ID, and evidence links.

| Check | Expected result | Status | Evidence |
| --- | --- | --- | --- |
| Two-way audio | Host and participant hear each other | Not run | |
| Two-way video | Host and participant receive each camera | Not run | |
| Four-person room | Host plus three participants remain connected | Not run | |
| Network recovery | Temporary Wi-Fi/cellular interruption recovers, or shows `lost` | Not run | |
| Refresh and rejoin | Refresh restores room membership and media | Not run | |
| Camera lifecycle | Camera on → off → on; hardware indicator turns off while off | Not run | |
| Microphone lifecycle | Mic on → mute → unmute; remote audio follows state | Not run | |
| Host failover | Co-host receives host role after disconnect grace period | Not run | |
| Permission denial | Actionable microphone/camera guidance appears | Not run | |

## Release decision

Circles may be described as **implemented and awaiting certification** until
every applicable row has pass/fail evidence. Do not describe it as
production-certified based only on a successful build or route test run.