# Spark creation and theme reference review

Reviewed October 1, 2026. This note records how the local Niakofa references informed the current Spark-creation work. The repository at `b94a42c8` is the implementation source of truth.

## Reference inputs

- `docs/REVIEW.md` and the current repository README.
- `attached_assets/niakofa-v3-delta_1790832219735.zip`, inspected as reference material, including its patch, source/tests, migration, and SVG assets.
- `attached_assets/Pasted-I-re-cloned-the-repo-main-at-36522f0-and-ran-your-own-p_1790832044943.txt` and `attached_assets/Pasted-I-m-tracing-where-Create-a-Spark-goes-once-you-click-it_1790803843648.txt`.
- The supplied `CommunityMomentsExperience`/`CommunitySocialShell` TSX and CSS snapshots, `create-spark-fix`, `community-shell-v5`, `moments-immersive-v5`, and `niakofa-community-v5` patches, and the standalone `SparksCameraRecorder` snapshot.
- `attached_assets/image_1790811752169.png`, the community visual contact sheet, and the other supplied screenshots/images, used only as visual references.
- Earlier Niakofa media/community ZIPs and pasted status reports were treated as historical references; generic Facebook-clone archives were not used as implementation sources.

Uploaded archives, patches, source files, SVGs, and images remain reference-only. No archived implementation or screenshot content was copied into the product.

## Compatibility findings

- The most recent supplied source package is based on the older `36522f07` snapshot, not the current repository head. Its patch does not apply cleanly to the current composer, and its migration numbering conflicts with the current migration history. It was not applied wholesale.
- Create a Spark already enters the existing Spark Studio flow. The source chooser, editor, audience selection, gallery, drafts, and publishing behavior are part of that flow and must remain intact.
- Camera acquisition previously required an extra start action, defaulted to the rear camera, and kept capture tracks live during preview. The updated camera component starts the viewfinder after the user chooses Camera, defaults to the front camera, releases tracks for preview, and reacquires them when recording resumes.
- The reference screenshot is not a production asset. The app's theme is implemented with native tokens and styles instead of embedding the screenshot.

## Changes informed by the review

- Kept the existing Camera, Gallery, and Start with words choices while removing numbered stage labels.
- Preserved the existing editor and publishing workflow; made the camera surface full-screen and styled it with the app's cyan-on-navy palette.
- Rethemed the shared app tokens and active Community, Moments/Spark, Exchange, profile, authentication, loading, offline, and browser-icon surfaces. Error and warning colors remain semantic.
- Added Spark/Moment report reasons for sexual content, hate or harassment, self-harm, and copyright/IP, with server-side target/reason validation and a new additive migration. The migration has not been applied to production.
- Added a build-identity check so an open tab can offer a reload when the API reports a newer deployed commit. An unavailable health check does not block the app.

## Verification boundary

Verified locally:

- Workspace build passed, including the workspace typechecks, Vite production build, and API build.
- Camera/build-identity tests passed 7/7; report-validation and community-moderation API tests passed 14/14.
- Migration 0192 applied to the local development database. No production migration was run.
- The web preview and `/api/healthz` both returned HTTP 200. The landing-page screenshot showed the sign-in screen in the cyan-on-navy palette, with no app errors in the browser console.

A real-device camera permission and recording session is still required before claiming physical-device certification.

The source attachments are local workspace references and are not guaranteed to be present in a GitHub checkout. Keep them out of production bundles and do not publish their image contents.