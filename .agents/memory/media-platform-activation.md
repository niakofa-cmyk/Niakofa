---
name: Media activation gate
description: Production prerequisites and the fail-closed decision for Niakofa’s universal media foundation.
---

The universal media platform must remain opt-in until production cloud object storage, durable Redis, FFmpeg/FFprobe, and real photo/video variant verification are all available.

**Why:** Local development intentionally has no Redis and production storage provisioning was not verified; enabling earlier would create pending uploads or unavailable variants.

**How to apply:** Keep the feature flag disabled by default. Before enabling it, run a real upload through probe, thumbnail, transcode, and authorization checks. Keep audio mixing disabled until licensing and a real mixer are approved.

In isolated API policy tests, scope a temporary `MEDIA_PLATFORM_V21=1` override to the individual media-route request and restore it immediately. Do not enable it in suite setup: unrelated story creation can enter queue-dependent media paths when the test queue is intentionally disabled.

**Why:** A suite-wide test override caused ordinary Community Story creation to return 503 before the media access assertions ran.

**How to apply:** Keep the universal flag off in app and workflow configuration; use a request-scoped override only for read/denial policy branches that do not upload or stream bytes.

Presigned PUT upload sessions do not constrain bytes at the object-storage provider. Bounded API/worker reads prevent a subsequent oversized object from exhausting application memory, but do not prevent an oversized write into the bucket while the URL remains valid.

**Why:** A storage HEAD check and a later bounded read cannot enforce an upload-size limit at the bucket; the object can also be replaced between those operations.

**How to apply:** Treat provider-side size enforcement or a size-conditioned upload policy as a separate release prerequisite. Certify browser PUT CORS, worker delivery, signed playback cookies in the deployed browser context, and deletion/retry behavior before activation.

The generic GitHub CI runner may not have FFmpeg/FFprobe installed. A locally passing real-media test may therefore be skipped there when the executables are absent; `REQUIRE_MEDIA_TOOLCHAIN_TEST=1` makes their absence a failure.

**Why:** A green CI run without the binaries is not evidence that deployed media normalization or composition can execute.

**How to apply:** Keep FFmpeg-independent contract tests in CI, but require the real toolchain smoke and real-media test in an environment with the production binaries before V21 activation. Never infer production readiness from a skipped CI media test.

Verify the *served* production readiness dependency's `storage.required` field after releases and configuration changes, not only its `storage.status` or overall `ready`: a configured cloud backend can report ready even while V21 is unexpectedly enabled.

**Why:** A production release was healthy with cloud storage configured but had the V21 flag on despite the intended certification hold. The flag had to be explicitly turned off and the resulting deployment rechecked.

**How to apply:** While certification remains incomplete, require `storage.required === false` on the canonical host; a healthy status alone is not a flag-off certificate. Recheck after any variable update or redeploy.

Do not equate a bucket's display label with its S3 API name when gating production probes. Verify the configured API bucket, endpoint, and credentials belong together through the operator console; a successful I/O probe alone cannot certify that the target is the intended bucket.

**Why:** A previous provider configuration required the unique S3 API bucket name rather than the displayed label. A literal display-name assertion can stop an otherwise valid probe before it writes and give misleading evidence of storage failure.

**How to apply:** Keep the storage I/O check bounded and independent of a hardcoded display name. Require separate operator confirmation of bucket identity before enabling V21; never silently swap a bucket used by existing media.