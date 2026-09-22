# Messages redesign reference package

Preserved reference materials used while implementing the contextual Messages enhancement.

- The PNG is the uploaded Messages concept image used as a visual/product specification.
- The ZIP contains the previously reviewed V21 request-routing materials. Current `main` already supersedes that routing patch; it is preserved for traceability and was not reapplied.
- The TXT files contain the uploaded project-state and implementation guidance documents. They were read in full before editing. The V23 documents remain retained in the workspace upload area and are staged with this release so the review context is not lost.
- The V23 ZIP is a complete repository snapshot. Its SHA-256 is recorded below rather than duplicating the full repository inside the repository. Its eight-file Messages delta was compared against `origin/main` and merged into the canonical source.
- The current release also closes the documented CI type error by using LiveKit's `TrackSource` enum for direct-call publish permissions, and restores the call controls through `ConversationThread` to preserve the existing UI behavior.
- `SHA256SUMS` records the SHA-256 checksum for every preserved file in this directory.

The canonical implementation remains under `artifacts/`; this directory is reference-only.