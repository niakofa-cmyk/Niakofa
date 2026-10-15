---
name: Chromium streamed upload bodies
description: Verify raw browser media uploads when Playwright does not expose streamed XHR file bytes.
---

For browser tests that need byte-level proof of a raw `File` upload, return an upload URL on an ephemeral loopback server instead of fulfilling the binary PUT through Playwright route interception. Scope the server to `127.0.0.1`, allow CORS only from the test app origin, compare the received bytes with the generated synthetic file, and remove the temporary file during cleanup. Keep the app API fixture local and intercept its requests separately.

**Why:** In this workspace, Chromium sent the media upload through XHR but Playwright's intercepted request exposed neither the body buffer nor a content-length. A successful 204 mock alone would not prove that the expected bytes were transferred.

**How to apply:** Use this boundary only for disposable local browser tests with synthetic media; bind an ephemeral port, restrict the allowed origin and upload path, and verify both byte equality and post-test deletion.
