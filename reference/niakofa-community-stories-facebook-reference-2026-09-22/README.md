# Niakofa Community Stories reference

This reference bundle records the supplied Facebook-style media example and the
review materials used for the September 22, 2026 Community Stories pass.

## Product direction

The attached screenshot is a Facebook Reels surface, not a Stories surface.
Niakofa uses the visual language that makes the reference feel immersive
(full-viewport media, floating controls, sequential navigation), while keeping
Stories semantics: temporary moments, author identity, progress, reactions,
replies, sharing, and creator-to-creator navigation. A separate Reels product
is intentionally not added to the primary Community navigation.

## Included source materials

- `facebook-reels-reference.jpg` — supplied visual reference.
- `stories-review.txt` — full review of the existing Niakofa Stories and the
  required immersive viewer behavior.
- `repository-review.txt` — full repository verification and V2 shell contract.
- `community-facebook-social-v2.zip` — supplied shell redesign package,
  preserved for traceability.

The source copies are kept alongside this README so future passes can compare
the implementation against the same accepted direction without relying on chat
attachments.

## Acceptance focus

- Community primary chrome has exactly five destinations: Home, Stories,
  People, Hubs, and Notifications.
- Profile, Requests, Services, Spirals, Media, and Diaspora remain reachable
  behind the Community menu.
- Stories is an immersive full-viewport destination, not a Gratitude dashboard.
- The Story viewer supports tap navigation, sequential creator navigation,
  swipe navigation, press-and-hold pause/resume, swipe-down close, replies,
  reactions, and sharing.
- Story APIs, authenticated media, moderation, persistence, and Nia remain
  separate from this visual/navigation pass.