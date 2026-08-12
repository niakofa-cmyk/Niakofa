# Exact current upload snapshot

This directory preserves the complete set of files supplied for the August 12,
2026 Niakofa Legacy production-readiness pass. It includes the four reference
images, product notes, standalone HTML preview, original-art demo pack, brand
pack, generator source library, and patch materials.

The ZIP archives are retained for provenance and inspection; their contents
are not copied wholesale into the browser bundle. Only the curated,
license-safe original-art runtime assets are shipped under
`artifacts/pay-it-forward/public/legacy-world-assets/`.

## Integrity

`SHA256SUMS.txt` records the SHA-256 digest of every copied upload in this
directory except the manifest and this README. The three uploaded ZIP archives
were also checked with `unzip -tqq` and passed integrity validation.

## Runtime boundary

The generator archive is a source library and remains outside the browser
runtime. The original-art demo pack is the source for the curated character
layers and the 13 world tiles now used by the playable House of Mensah map.