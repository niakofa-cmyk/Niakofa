# Cross-community media policy matrix

The opt-in API integration test uses three synthetic, approved users: Account A
publishes, Account B belongs to A's community, and Account C belongs to a
different community. It exercises the visibility rules for Community Stories,
Exchange Sparks, Hub posts and media, gratitude, Griot stories, Family Stories,
Media Studio staging contexts, and public Spirals. A separate video-Moment case
checks that A and B can see and play the published video, C cannot see or obtain
a playback grant, neither reader can delete it, and A's deletion removes its
local files and feed entries.

**Latest local verification:** pending after adding the three-account video
case. This local result does not certify production Spark privacy.

Spirals are public across community boundaries: an approved user from another
community can see and join a live public Spiral. The LiveKit media token remains
gated by active participation; the test verifies that a token is denied before
joining and issued after joining. The test signs a token with local fake
credentials and a reserved `.invalid` LiveKit host; it makes no LiveKit network
connection.

## Run locally

From the repository root, start the disposable local PostgreSQL cluster with a
dedicated test database, apply the repository migrations, and run the focused
suite. Empty storage settings keep this test on local disk:

```bash
NIAKOFA_LOCAL_PGDATABASE=niakofa_cross_community_video_test \
STORAGE_BUCKET= STORAGE_ENDPOINT= STORAGE_CDN_URL= \
bash scripts/start-local-postgres.sh bash -lc \
  'cd artifacts/api-server && node ../../lib/db/scripts/run-migrations.mjs && export FAMILY_STORY_RUNTIME_TEST_DATABASE_URL="$DATABASE_URL" && npm run test:community-media-runtime'
```

The suite refuses to run unless its explicit opt-in is set and the connected
database name contains `dev` or `test`. It creates recognizable synthetic
fixtures, uses FFmpeg to create a one-second synthetic MP4, and writes its staged
original and variant only to local disk. It fails closed if object storage is
configured and fails if scoped fixture or local-file cleanup fails. The
request-scoped V21 override is used only for media authorization checks; the app
and workflow feature flag remain unchanged.

This local matrix verifies API policy and test-database behavior. It is not
production account, worker, storage, or physical-device certification.

## Moments links and video coverage boundary

The API matrix now exercises the normal Moment publish/feed routes with a
ready local MP4, playback-grant authorization and streaming, cross-community
denial, and owner cleanup. It does not exercise normal browser feed rendering,
per-item link copy/open, the browser upload flow, or the asynchronous video
processing worker. The frontend
`community-moments-feed.test.ts` contract suite verifies that each Moment
builds its own share URL with the correct audience context and wires copy/native
sharing; it does not click the link in a signed-in browser.

The separately gated `ops/media-v21-resume-compose-certification.md` run covers
resumable clip uploads, a temporarily published Story, camera-clip composition,
private byte-range playback, cross-community denial, and cleanup. The 2026-10-04
production browser run also opened the owner’s Moments feed, copied and checked
the exact item-specific Community link, opened that link as an approved viewer
from another Community, and confirmed the Moment was absent from that viewer’s
feed and authenticated feed response.

That run passed 1/1 against canonical `https://niakofa.com`, served commit
`251293f592cf84828bcb555272efcfc14668063c`. Both synthetic uploads reached
`ready`, composition completed, the owner received byte-range and full
composition playback, and the other Community and anonymous viewer were denied
composition/playback access. Cleanup deleted the temporary Story and source
assets, verified their API endpoints were inaccessible, and removed private
browser states, generated clips, and test output. The Story was briefly visible
to its normal Community audience and could emit the normal Story-created event.
The UI link check suppressed view/share-counter requests and opted out of
analytics; playback authorization was separately checked against production.

This evidence does not certify a physical camera, Studio’s browser upload/draft
flow, independent object-store or worker-temporary-file cleanup, Exchange
listing Sparks, or Family Story playback. Do not treat the synthetic local
users below as production accounts.

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