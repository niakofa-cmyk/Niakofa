---
name: Native browser function receivers
description: Dependency-injected fetch must retain a valid browser receiver during Moments playback.
---

Do not invoke native browser fetch as a method of an arbitrary dependency object; retain the global receiver when injecting it into playback resolvers.

**Why:** Node mocks accepted the dependency object as `this`, but Chromium rejected the same call with `Illegal invocation`. Uploads and processing succeeded while ready Moments videos remained unviewable.

**How to apply:** Include a receiver-sensitive fetch fixture when testing browser request helpers, and verify actual video playback rather than treating a ready upload as display proof.

For local video acceptance, check the test browser's ability to decode the served derivative, not only the selected original. The default tester Chromium lacked H.264, while `/repl/tools/bin/chromium` reported H.264 support.

**Why:** An AV1 original preview played, but the server's intended H.264 derivative failed in the default test browser despite successful authenticated streaming.

**How to apply:** Recheck `canPlayType` in the current installed system browser before testing; do not change production encodings or bypass derived media to make a codec-limited test browser pass.
