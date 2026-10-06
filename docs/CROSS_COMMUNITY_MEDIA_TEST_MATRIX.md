# Cross-community media policy matrix

The opt-in API integration test uses three synthetic, approved users: Account A
publishes, Account B belongs to A's community, and Account C belongs to a
different community. It exercises the visibility rules for Community Stories,
Exchange Sparks, Hub posts and media, gratitude, Griot stories, Family Stories,
Media Studio staging contexts, and public Spirals. A separate video-Moment case
checks that A and B can see and play the published video, C cannot see or obtain
a playback grant, neither reader can delete it, and A's deletion removes its
local files and feed entries.

**Latest local verification (2026-10-06):** 1 suite, 3 tests passed against a
dedicated local test database and isolated uploads directory. The video case
covers the synthetic upload-to-processing-to-feed path for approved Accounts A
and B in one community and Account C in another. This local result does not
certify production Spark privacy.

Spirals are public across community boundaries: an approved user from another
community can see and join a live public Spiral. The LiveKit media token remains
gated by active participation; the test verifies that a token is denied before
joining and issued after joining. The test signs a token with local fake
credentials and a reserved `.invalid` LiveKit host; it makes no LiveKit network
connection.

## Run locally

From the repository root, start the disposable local PostgreSQL cluster with a
dedicated test database and uploads directory, apply the repository migrations,
and run the focused suite. The cleanup trap drops the test database and removes
the temporary files. Empty storage settings keep it off object storage:

```bash
set -euo pipefail
TEST_DB="niakofa_cross_community_video_test_$(date +%s)"
TEST_UPLOADS="$(mktemp -d /tmp/niakofa-cross-community-uploads.XXXXXX)"
cleanup() {
  PGUSER="$(id -un)" PGHOST=/tmp/niakofa-postgres-socket PGPORT=55432 \
    psql --dbname=postgres --quiet --command="DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$TEST_UPLOADS"
}
trap cleanup EXIT
export STORAGE_BUCKET='' STORAGE_ENDPOINT='' STORAGE_CDN_URL=''
NIAKOFA_LOCAL_PGPORT=55432 NIAKOFA_LOCAL_PGDATABASE="$TEST_DB" \
MEDIA_TEST_UPLOADS_DIR="$TEST_UPLOADS" \
bash scripts/start-local-postgres.sh bash -lc \
  'cd artifacts/api-server && node ../../lib/db/scripts/run-migrations.mjs && export FAMILY_STORY_RUNTIME_TEST_DATABASE_URL="$DATABASE_URL" && npm run test:community-media-runtime'
```

The suite refuses to run unless its explicit opt-in is set and the connected
database name contains `dev` or `test`. It creates recognizable synthetic
fixtures, uses FFmpeg to create a one-second synthetic MP4, and confines all
upload and worker output to the temporary local directory. It fails closed
without the dedicated test database and uploads directory, fails if object
storage is configured, and fails if scoped fixture or file cleanup fails. A
test-only in-memory job publisher avoids Redis; the actual processing handler
still generates and validates the video thumbnail and MP4 variant. The
request-scoped V21 override is used only for route checks; the app and workflow
feature flag remain unchanged.

This local matrix verifies API policy, local upload/finalization, and the media
worker handler. It is not production account, BullMQ transport, object storage,
or physical-device certification.

## Catch videos that disappear after upload or processing

The API matrix uploads a generated MP4 through the same-origin media endpoint,
finalizes it, and runs the real probe, thumbnail, and transcode worker handler
against local storage before publishing the Moment. It verifies A/B feed access
and playback, C denial, processing-job completion, and owner cleanup. A small
in-memory publisher replaces Redis delivery in this opt-in test; it does not
certify BullMQ transport, the browser upload UI, normal browser feed rendering,
or per-item link copy/open.

The frontend
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