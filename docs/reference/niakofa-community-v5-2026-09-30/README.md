# Community v5 supplied references

These seven files are preserved copies of the material supplied with the
Community/Moments review. They are **references, not application source**.
The running app is implemented under `artifacts/pay-it-forward/`; do not copy
the snapshot over the current component or apply these patches to a later
revision without reviewing the diff.
The two original `.patch` files contain trailing spaces on some diff lines;
they remain unchanged so their bytes match the supplied references. Run
whitespace checks on live source and prose separately from these archives.

| Preserved file | Original attachment | Status |
| --- | --- | --- |
| `eslint-review.txt` | `Pasted-The-ESLint-failure-I-ran-CI-s-exact-command-npx-eslint-_1790798728849.txt` | Review notes, including the correction about the existing camera recorder. |
| `eslint-fix.patch` | `eslint-fix_1790798834163.patch` | One-line fix; also included in the combined patch. |
| `moments-immersive-v5.superseded.patch` | `moments-immersive-v5_1790798795813.patch` | Superseded by the combined patch; its palette conflicts with the current shell. |
| `CommunityMomentsExperience.snapshot.tsx.txt` | `CommunityMomentsExperience_1790798795813.tsx` | Older candidate snapshot, renamed to `.txt` so tooling does not treat it as live TSX. |
| `community-moments-experience.superseded.css` | `community-moments-experience_1790798795814.css` | Superseded purple/font variant; reference only. |
| `combined-patch-notes.txt` | `Pasted-Working-from-the-cloned-repo-I-ve-aligned-the-Moments-a_1790799059153.txt` | Corrected review notes identifying the combined patch. |
| `niakofa-community-v5.patch` | `niakofa-community-v5_1790800311824.patch` | Current layout/lint/style candidate; integrated into canonical source with mobile accessibility safeguards. |

No photographs or avatar image files were attached in this set. Product media
must come from authorized member content or separately approved, licensed
assets; illustrative portraits must never appear as real members.

## Village and Local product boundary

- **Add to My Village** should mean an explicit, reversible private save of an
  approved helper's profile. It is not the existing Spiral follow action or
  the private save of a Hub media item. **Join the Village** is helper
  onboarding, not the inverse of saving a helper.
- **Village Feed / Village Updates**, if added, should show eligible Sparks
  from saved helpers only after the server intersects the saved-author set
  with the current Story visibility, moderation, expiry, block, and mute rules.
  It needs persisted viewer-owned relationships and a cursor-compatible
  server feed filter. The existing Moments API does not provide either.
- **Local** should not imply GPS proximity. A precise first scope would be
  the viewer's *selected, approved Hub*, using server-verified membership;
  "From your Hub" is a clearer label for that scope. A radius or neighborhood
  feed would require separate consent, location policy, and backend filtering.

There is no decorative Following, Village Feed, or Local tab in the running
Moments experience. The current server feed accepts `hubId`, `limit`,
`cursor`, `search`, `tag`, and `authorId`; a new tab must not claim a different scope
until its authorization and filtering are implemented end to end.