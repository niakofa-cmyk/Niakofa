# Niakofa Media Studio rebuild references — 2026-10-01

These files preserve the user-provided rebuild direction and selected visual
references. They are research material, not alternate application code.

## Retained references

- `niakofa-media-studio-rebuild-2026-10-01-brief.txt` — the supplied Studio
  rebuild brief.
- `niakofa-media-studio-rebuild-2026-10-01.zip` — the small supplied rebuild
  package, retained intact for comparison. Its source files were reviewed as
  guidance; the working app remains the canonical implementation.
- `niakofa-media-studio-visual-reference.png` — supplied Niakofa product
  overview showing the Moments, Sparks, and Stories direction.
- `niakofa-studio-camera-controls-reference.jpg` — a crop of the supplied
  camera UI screenshot limited to the recording controls; personal camera
  preview content is excluded.

## Android clone boundary

`Compose-Snapchat-Clone-master_1790860459531.zip` (87,418,871 bytes, MIT
licensed) was inspected only for general interaction patterns. The archive is
not retained here and its Android implementation, mock data, and branded media
are not part of Niakofa. Recreate any useful behavior against Niakofa's own
camera, media, authorization, and storage contracts.

## Product boundaries

- Start from the existing camera-entry and draft-recovery flows; do not add a
  competing camera doorway.
- Keep Moments immersive, cyan-on-navy, individually limited to 60 seconds per
  video, and subject to its existing 24-hour expiry.
- A selected-media total over 60 seconds may offer an explicit, separate
  private Family Story copy. It must save original files into authorized Family
  memory storage, never preserve an expiring Moment URL.
- The Community and Family media APIs remain canonical. Reference package
  endpoints or storage assumptions do not replace their production
  certification requirements.

No credentials, connection URLs, private media, or user-session data are
included in this reference set.