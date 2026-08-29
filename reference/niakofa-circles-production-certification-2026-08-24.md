# Niakofa Circles — production certification record

## Scope

This record applies to the first-class Niakofa Circles audio/video product.
It does not certify the separate Niakofa Legacy RPG runtime.

The uploaded handoff specification is preserved at:

`attached_assets/Pasted--We-need-a-formally-defined-real-time-media-system-Impo_1787586192663.txt`

## State contract

- REST and WebSocket presence describe room membership and signaling reachability.
- WebRTC owns media health: `connecting`, `connected`, `reconnecting`, and `lost`.
- A successful REST resync or a `LIVE` room badge must never mark media connected.
- Media is `connected` only after at least one peer connection reports `connected`.
- Recovery is bounded to four ICE restart attempts with 1s, 2s, 4s, and 8s delays.
- Recording requires explicit host action and a visible recording indicator.

## Certification status

**Not production-certified yet.** The code and automated route coverage exist, but
real browser/device and real network evidence must be recorded before claiming
production readiness.

On August 29, 2026, the deterministic A–G LiveKit transport continuity suite
passed, including an explicit Wi-Fi → cellular handoff with active audio and
video republished under the same Circle identity. This verifies the adapter and
manager contracts but does not change the release status: real-browser,
real-SFU/TURN, NAT, and device evidence remains outstanding.

| Test                     | Required evidence                                    | Status                                     |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------ |
| Two-way audio            | Two real browsers hear host and participant          | Not run in this workspace                  |
| Two-way video            | Host and participant receive each other’s camera     | Not run in this workspace                  |
| Three or more people     | Host plus three participants stay connected          | Not run in this workspace                  |
| Network recovery         | Wi-Fi/cellular interruption recovers or shows `lost` | Automated handoff contract passes; real device not run |
| Refresh and rejoin       | Refresh restores room and A/V                        | Not run in this workspace                  |
| Camera lifecycle         | Camera on → off → on stays live                      | Not run in this workspace                  |
| Microphone lifecycle     | Mic on → mute → unmute stays live                    | Not run in this workspace                  |
| Host disconnect/failover | Grace period and server-enforced failover work       | Not run in this workspace                  |
| Permission denial        | Actionable browser permission message appears        | Automated path exists; real device not run |

## Release gate

Run the application and API with migrated database data, then execute every
matrix row above using two current browsers and a real TURN/NAT path. Attach
browser console/network evidence and record pass/fail here. Until then, use
“implemented and awaiting certification,” not “production hardened.”
