# Niakofa V21 production storage certification reference

This reference preserves the decisions from the supplied
`Niakofa_V21_Production_Storage_Certification_Enhanced` package and the three
uploaded review notes. The original archive and notes remain in the workspace
attachment area; the executable implementation and operator-facing copies are
tracked here so future work does not depend on an attachment-only artifact.

## Canonical tracked implementation

- `artifacts/api-server/src/lib/storageProbe.ts` — trusted operational
  PUT→HEAD→byte-count→DELETE probe with bounded cleanup retries
- `artifacts/api-server/scripts/verify-object-storage.mjs` — Railway one-off
  CLI; never enables `MEDIA_PLATFORM_V21`
- `artifacts/api-server/scripts/verify-media-toolchain.mjs` — real synthetic
  FFmpeg→FFprobe smoke check
- `artifacts/api-server/src/lib/mediaCapabilities.ts` — same media execution
  check at V21 startup
- `docs/PRODUCTION_ACCEPTANCE_MATRIX.md` — configuration, I/O, toolchain,
  activation, and authenticated acceptance gates
- `docs/IO_CERTIFICATION_RUNBOOK.md` — operator sequence and failure handling
- `ops/RAILWAY_ONEOFF_PROBE.md` — production shell commands
- `ops/certification-checklist.sh` — print-only release checklist

## Architecture decisions retained

1. Keep `niakofa-production-media` as the intended private production bucket.
2. Keep `MEDIA_PLATFORM_V21` fail-closed and disabled until real storage I/O,
   media-toolchain execution, and authenticated media acceptance pass.
3. Do not add a permanent admin or public route whose only purpose is a
   credential-backed storage probe.
4. Keep `STORAGE_CDN_URL` unset for private-bucket presigned access.
5. Do not delete the older `niakofa-media` bucket without an explicit retention
   decision.

No image files were included in the supplied certification archive; the
existing Niakofa visual references and screenshots remain under `public/` and
`screenshots/`. The runtime landing-page evidence captured during this
validation is `screenshots/niakofa-production-storage-certification-preview.jpg`.