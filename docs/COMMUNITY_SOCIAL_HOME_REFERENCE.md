# Niakofa Community social-home reference

This document preserves the product direction used for the Community work without
copying the large uploaded repository archive into the source tree.

## Source material

- `attached_assets/Pasted-Check-the-updated-repo-for-your-recommendations-How-wel_1790042953343.txt`
  contains the Community assessment and the Facebook-style social-home target.
- `attached_assets/community-and-media-fixes_1790042935488.patch` contains the
  five-part implementation proposal covering media producers, navigation,
  default Hub resolution, post cards, and unified Create.
- `attached_assets/Niakofa-community-and-media_1790042935488.zip` is the full
  reference snapshot. It was integrity-checked and extracted during the
  September 22, 2026 review; the checked-in source remains the canonical copy.

## Product target

Community is Niakofa's social home, not a dashboard of unrelated feature tabs:

1. Community identity and the active Hub.
2. Stories rail.
3. One Create entry point for Post, Story, Request, and Gratitude.
4. A chronological feed of Hub posts, gratitude, and open requests.
5. Social post cards with author identity, relative time, media, Like,
   Comment, Share, visible comments, and a comment composer.
6. Niakofa-native destinations such as Requests, Spirals, Skills, Heroes,
   Resources, Pool, County, and Impact remain available without competing with
   the Feed as equal homepage identities.

The experience should be Facebook-like in interaction density and information
hierarchy, while keeping Niakofa's Hub membership, Requests, Spirals, Diaspora,
moderation, and media authorization rules intact.

## Implementation checklist

- [x] Plain `/community` resolves the signed-in user's approved Hub through
      `GET /api/community/my-hub`; an explicit `?hubId=` still wins.
- [x] Merged Hub identities resolve through `primary_hub_id`.
- [x] Community navigation keeps Feed, Requests, and Spirals primary and moves
      secondary destinations under More.
- [x] Hub post cards use avatar/name/time, media, engagement counts, and a
      functional Like/Comment/Share row.
- [x] Share uses the native share sheet when available and clipboard fallback
      feedback otherwise.
- [x] Create exposes Post, Story, Request, and Gratitude from one entry point.
- [x] Story creation opens correctly even when Create is chosen from another
      Community tab.
- [x] Hub and Request media remain connected to the universal MediaAsset
      pipeline and authenticated media delivery.

## Verification record

The September 22, 2026 review completed:

- full workspace TypeScript check;
- targeted ESLint for Community, Stories, and Hub API files;
- all API Jest suites: 52 suites, 396 passing tests, 5 skipped;
- API endpoint tests: 19 passing tests;
- V19 Community/Messages contract: 7 passing tests;
- local migration and seed startup through migration 0157;
- web preview and API smoke checks.

The V17.1 contract's unrelated Direct-pane safe-area requirement is also
covered in the current source so the mobile Messages surface does not overlap
the device home indicator.

## Remaining product work

The next meaningful improvements are authenticated browser acceptance coverage
for the default-Hub path and Create actions, plus continued reduction of
dashboard widgets below the social feed. These are follow-up product/test
items, not prerequisites for the current Community feed wiring.