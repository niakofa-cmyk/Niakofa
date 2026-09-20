---
name: Media activation gate
description: Production prerequisites and the fail-closed decision for Niakofa’s universal media foundation.
---

The universal media platform must remain opt-in until production cloud object storage, durable Redis, FFmpeg/FFprobe, and real photo/video variant verification are all available.

**Why:** Local development intentionally has no Redis and production storage provisioning was not verified; enabling earlier would create pending uploads or unavailable variants.

**How to apply:** Keep the feature flag disabled by default. Before enabling it, run a real upload through probe, thumbnail, transcode, and authorization checks. Keep audio mixing disabled until licensing and a real mixer are approved.