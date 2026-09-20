#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
# Fill these only from the real Railway Bucket references or Credentials tab.
STORAGE_BUCKET=
STORAGE_ENDPOINT=
STORAGE_REGION=
STORAGE_CDN_URL=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Keep off until the storage probe and the flag-off deployment checks pass.
# MEDIA_PLATFORM_V21=1
EOF