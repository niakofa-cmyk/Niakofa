# Niakofa Community V4 audit

**Review date:** 2026-09-22
**Canonical implementation:** `artifacts/pay-it-forward/`
**API implementation:** `artifacts/api-server/`

## Scope

This review covered the authenticated Community surface at desktop and mobile widths, the V4 reference package, existing acceptance notes, the current Community source, and the realtime persistence fix already present in the working tree.

The retained screenshots in this directory were captured from the local preview workflow at:

- 1280×900 desktop
- 390×844 mobile

The local review account was authenticated through the normal login form. No production account, production database, or deployment credential was used.

## Acceptance checklist

- Community owns one icon-first six-destination navigation row: Home, Stories, People, Hubs, Notifications, and Profile.
- Desktop uses the inline search field; mobile uses the expandable search control.
- The menu contains secondary Niakofa systems without duplicating the primary social row: Requests, Services, Circles, Media, and Diaspora.
- Create is one consistent entry point on every Community section.
- Create offers Post, Story, Request, and Gratitude.
- Story creation returns to the Community surface and opens the existing Story experience.
- Gratitude creation posts through the authenticated `/api/gratitude` endpoint and preserves server-derived author identity.
- The no-Hub home state explains why the feed is empty and links directly to Diaspora.
- Mobile and desktop content remain single-column, readable, and within the intended social-feed width.
- Menu dismissal supports backdrop click, Escape, and focus containment.
- Authenticated media continues to load through bearer-protected same-origin requests and object URLs.
- Realtime events persist before delivery; the typed PostgreSQL audience-array fix was verified separately during this review.

## Changes made during this review

1. Added `CommunityGratitudeComposer`, an accessible authenticated composer backed by the existing gratitude API.
2. Added Gratitude to the unified Create surface.
3. Made the top Create control consistently open the Create surface instead of silently depending on a feed composer being mounted.
4. Added an actionable Explore Diaspora link to the no-Hub home state.
5. Added source-contract tests for the Gratitude entry point and no-Hub navigation.
6. Retained desktop, mobile, Create, and Gratitude visual evidence in this directory.

## Deliberate boundaries

- The local review account has no Hub membership, so this evidence does not claim that production Hub membership, Hub-specific permissions, or seeded production feed content are certified.
- Real-device microphone, camera, LiveKit, push-notification, and mobile browser behavior still require the approved device certification gate documented in the broader audit addendum.
- Production acceptance still requires the approved disposable production states, canonical host verification, and served-commit parity described by the release-certification references.
- The uploaded V4 ZIP and other unlicensed reference projects were inspected and retained only as references. Their source, assets, credentials, schemas, and backend configuration were not copied into Niakofa.