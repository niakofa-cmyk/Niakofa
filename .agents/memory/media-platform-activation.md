---
name: Media activation gate
description: Production prerequisites and the fail-closed decision for Niakofa’s universal media foundation.
---

The universal media platform must remain opt-in until production cloud object storage, durable Redis, FFmpeg/FFprobe, and real photo/video variant verification are all available.

**Why:** Local development intentionally has no Redis and production storage provisioning was not verified; enabling earlier would create pending uploads or unavailable variants.

**How to apply:** Keep the feature flag disabled by default. Before enabling it, run a real upload through probe, thumbnail, transcode, and authorization checks. Keep audio mixing disabled until licensing and a real mixer are approved.

Presigned PUT upload sessions do not constrain bytes at the object-storage provider. Bounded API/worker reads prevent a subsequent oversized object from exhausting application memory, but do not prevent an oversized write into the bucket while the URL remains valid.

**Why:** A storage HEAD check and a later bounded read cannot enforce an upload-size limit at the bucket; the object can also be replaced between those operations.

**How to apply:** Treat provider-side size enforcement or a size-conditioned upload policy as a separate release prerequisite. Certify browser PUT CORS, worker delivery, signed playback cookies in the deployed browser context, and deletion/retry behavior before activation.

The generic GitHub CI runner may not have FFmpeg/FFprobe installed. A locally passing real-media test may therefore be skipped there when the executables are absent; `REQUIRE_MEDIA_TOOLCHAIN_TEST=1` makes their absence a failure.

**Why:** A green CI run without the binaries is not evidence that deployed media normalization or composition can execute.

**How to apply:** Keep FFmpeg-independent contract tests in CI, but require the real toolchain smoke and real-media test in an environment with the production binaries before V21 activation. Never infer production readiness from a skipped CI media test.

Verify the *served* production readiness dependency's `storage.required` field after releases and configuration changes, not only its `storage.status` or overall `ready`: a configured cloud backend can report ready even while V21 is unexpectedly enabled.

**Why:** A production release was healthy with cloud storage configured but had the V21 flag on despite the intended certification hold. The flag had to be explicitly turned off and the resulting deployment rechecked.

**How to apply:** While certification remains incomplete, require `storage.required === false` on the canonical host; a healthy status alone is not a flag-off certificate. Recheck after any variable update or redeploy.