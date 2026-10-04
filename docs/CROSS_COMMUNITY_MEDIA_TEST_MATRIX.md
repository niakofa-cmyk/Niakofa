# Cross-community media policy matrix

The opt-in API integration test uses two synthetic, approved users assigned to
different communities in the local development database. It exercises the
visibility rules for Community Stories, Exchange Sparks, Hub posts and media,
gratitude, Griot stories, Family Stories, Media Studio staging contexts, and
public Spirals.

**Latest local verification (2026-10-04):** 1 suite, 2 tests passed against the
local development database. This result does not certify production Spark
privacy.

Spirals are public across community boundaries: an approved user from another
community can see and join a live public Spiral. The LiveKit media token remains
gated by active participation; the test verifies that a token is denied before
joining and issued after joining. The test signs a token with local fake
credentials and a reserved `.invalid` LiveKit host; it makes no LiveKit network
connection.

## Run locally

From the repository root, start the disposable local PostgreSQL cluster, apply
the repository migrations, and run the focused suite:

```bash
bash scripts/start-local-postgres.sh bash -lc \
  'cd artifacts/api-server && node ../../lib/db/scripts/run-migrations.mjs && export FAMILY_STORY_RUNTIME_TEST_DATABASE_URL="$DATABASE_URL" && npm run test:community-media-runtime'
```

The suite refuses to run unless its explicit opt-in is set and the connected
database name contains `dev` or `test`. It creates recognizable synthetic
fixtures, stores no real media bytes, does not access object storage, and fails
if scoped fixture cleanup fails. The request-scoped V21 override is used only
for media authorization checks; the app and workflow feature flag remain
unchanged.

This local matrix verifies API policy and test-database behavior. It is not
production account, worker, storage, or physical-device certification.

## Moments links and video coverage boundary

The API matrix does not exercise normal browser feed rendering, per-item link
copy/open, real upload bytes, video processing, or playback. The frontend
`community-moments-feed.test.ts` contract suite verifies that each Moment
builds its own share URL with the correct audience context and wires copy/native
sharing; it does not click the link in a signed-in browser.

The separately gated `ops/media-v21-resume-compose-certification.md` run covers
resumable clip uploads, a temporarily published Story, camera-clip composition,
private byte-range playback, cross-community denial, and cleanup. It is
mutating production acceptance, not a substitute for verifying the Studio
publish-to-feed and per-item share-link journey.

For that journey, the production browser acceptance still needs two approved
disposable users from different Communities: publish a video Moment as the
owner, confirm it appears in the owner’s feed, use that item’s share link, check
the other Community’s feed and direct-media denial, verify authorized playback,
and reconcile deletion of the temporary Story and media. Do not treat the
synthetic local users below as those accounts.

## Production Spark acceptance prerequisites

Production cross-community Spark privacy has not yet been verified. The
separately gated run still needs:

- a verified, approved disposable owner account and its already-approved active
  Spark listing;
- a distinct verified, approved disposable viewer account from another
  community;
- validated private browser states, the exact served commit, private recovery
  storage, and explicit operator confirmations.

Keep credentials and browser state outside the repository. The synthetic local
users created by the regression test are not production credentials.