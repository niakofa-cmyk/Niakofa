---
name: Media MIME parameter canonicalization
description: Browser media MIME values may include codec parameters that should not break upload validation.
---

**Rule:** Normalize MIME values to their lowercase base type before persisting an upload session, comparing resumable-upload headers, or validating content. Keep signature and media-metadata validation as separate checks.

**Why:** Browsers can report MediaRecorder types such as `video/webm;codecs=vp9,opus`, while supported-type checks expect the base MIME type. Treating the parameterized value as a different format causes valid files to fail upload validation.

**How to apply:** Canonicalize at media session creation and every later type comparison. Do not use filename extensions or the declared MIME value as a substitute for validating the bytes.
