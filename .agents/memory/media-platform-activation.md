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

For production acceptance that requires private account state or media, credential presence alone is not authorization to probe live data. An authorized operator must confirm that the existing API storage bucket is private, is the intended bucket, and holds the approved account's fixed state object. Keep read-only Family Story playback separate from write-capable media certification.

**Why:** A working credential or private media URL does not establish bucket privacy, object ownership, or that the state belongs to an approved test account.

**How to apply:** Obtain operator verification before bucket reads, validate state structure before browser requests, keep Family Story playback GET-only, and require separate disposable-account and activation gates for media mutations.

If Railway service-shell access and the local Railway CLI are unavailable, a temporary Railway Function can run the single-object storage check without changing the API service or V21. Reference the verified bucket's variables rather than copying credentials, guard against any S3 bucket name other than the verified runtime target, use one deterministic random key across retries, and remove the function only after cleanup is proven.

**Why:** On 2026-10-06, the connected Railway tools and local container could not reach the API shell; a staged, isolated Function provided a bounded execution path while preserving the live API configuration.

**How to apply:** Use this fallback only after explicit approval for a temporary production deployment and removal. Stage and inspect only the Function and its bucket references before deploying. Never read or print credential values, change V21, or start another key while cleanup is unproven.

The operator confirmed on 2026-10-07 that production `STORAGE_BUCKET` resolves to the unique S3 `BUCKET` from `niakofa-production-media`, and that the endpoint and access-key references belong to that same resource.

**Why:** Railway’s display label is not the S3 API bucket name, and credential values must not be retrieved just to validate their references.

**How to apply:** Treat this as operator evidence for the bounded probe; reconfirm if the bucket resource or API variable references change.