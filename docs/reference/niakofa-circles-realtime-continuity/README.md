# Niakofa Circles realtime continuity reference

This directory records the source package used to harden the canonical
Niakofa Circles implementation.

## Supplied reference material

- `attached_assets/Pasted-build-the-CircleRealtimeSessionManager-connect-reconnec_1787849273218.txt`
  - continuity milestone request and hard media invariants
- `attached_assets/Pasted-Check-the-new-updated-repo-This-is-the-updated-repo-is-_1787849288508.txt`
  - full Circles assessment and A–G certification matrix
- `attached_assets/niakofa-circles-realtime-continuity_1787849300638.zip`
  - supplied manager draft, assessment, design, apply checklist, and invariant tests

## Implemented contract

The active frontend uses `CircleRealtimeSessionManager` as the LiveKit media
lifecycle owner. The room page remains responsible for REST/WS membership,
presence, moderation, chat, and recording UI. Recovery is media-only: no page
reload and no caching of WebRTC frames or tracks.

The manager:

- refreshes short-lived media tokens before expiry;
- recovers after LiveKit, network, and visibility interruptions;
- serializes concurrent recovery signals;
- republishes microphone and camera independently;
- preserves microphone state when camera permission or hardware fails.

The media-token route uses the dedicated user/IP-aware Circle token limiter.
Real two-device WebRTC/TURN certification remains a release gate beyond local
unit and build checks; see the supplied A–G matrix before production launch.