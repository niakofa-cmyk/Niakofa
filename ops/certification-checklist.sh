#!/usr/bin/env bash
# Print-only operator checklist. This script never mutates production.
set -euo pipefail

cat <<'EOF'
Niakofa production media certification checklist
================================================

[ ] Intended commit is green in CI and deploy verification
[ ] /api/healthz reports the intended S3-compatible backend
[ ] /api/readiness reports Redis and storage readiness
[ ] MEDIA_PLATFORM_V21 is unset or false
[ ] STORAGE_CDN_URL remains unset for the private bucket model
[ ] Railway one-off storage probe: PUT -> HEAD -> GET/hash -> DELETE -> HEAD-not-found verification
[ ] Verify the configured bucket matches the independently confirmed S3 API name before PUT
[ ] Probe cleanup is confirmed, including failure-path cleanup behavior
[ ] Production media toolchain smoke: FFmpeg creates -> FFprobe reads
[ ] MEDIA_PLATFORM_V21=1 only after both probes pass
[ ] Redeploy and confirm the media worker starts
[ ] Authenticated photo/video upload reaches ready
[ ] Authorized retrieval works and unauthorized retrieval is denied

Do not delete niakofa-media until an explicit retention decision exists.
Do not add a permanent HTTP endpoint for storage certification.
EOF