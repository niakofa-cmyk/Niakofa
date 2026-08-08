# Niakofa Legacy reference bundle

This index preserves the source material used to verify the public **House of
Mensah** demo and the Legacy RPG roadmap. The checked-in product references are
kept in `docs/legacy-mode-design/` and the visual references are kept in
`docs/legacy-mode-design/reference-images/`.

## Source requirements

The four session documents supplied for this edition are represented by the
following durable requirements:

| Requirement | Product reference |
| --- | --- |
| Public demo asset graph and SPA route verification | `scripts/src/verify-legacy-demo-deployment.mjs` and `/legacy/demo` |
| Full demo journey: prologue, Chapters 1–6, regeneration, co-op quest, finale | `artifacts/pay-it-forward/src/pages/legacy-demo.tsx` |
| Living house, artifacts, reunion, kitchen, vault, landmarks, seasons, NPC memory, business legacy | `docs/legacy-mode-design/legacy-rpg-design-brief.txt` and `docs/legacy-mode-design/LEGACY-DESIGN-REFERENCE.md` |
| Memory → world regeneration → new gameplay loop | `docs/NIAKOFA_LEGACY_REFERENCE.md` and `docs/family-vault-legacy-engine-spec.md` |

## August 8, 2026 verification reports

The reports used for this verification pass are retained in the repository
under `attached_assets/` so future sessions can trace the deployment and
Legacy-mode decisions without relying on chat history:

| Report | Coverage |
| --- | --- |
| `Pasted-I-ll-first-inventory-the-uploaded-archive-report-inspec_1786228753188.txt` | Archive recovery, active-source inspection, startup supervisor fix, test-validation notes, and Legacy reference preservation |
| `Pasted-Inspecting-deployment-failure-I-need-to-respond-to-the-_1786228770695.txt` | Railway/CI failure investigation, checkout and rollout-retry fixes, production endpoint verification, and Git synchronization findings |

These reports are evidence records, not runtime inputs. The active build is
the repository root; `niakofa-repo/` remains a historical duplicate and must
not be used as an edit target or deployment source until it is explicitly
retired in a later cleanup pass.

## Verification contract

The public demo must:

1. Load at `/legacy/demo` and `/legacy/demo/`.
2. Render without authentication or API data.
3. Persist progress under `niakofa:demo:v2`.
4. Advance through the prologue, six chapters, world regeneration, co-op
   quest, and finale.
5. Change the world version after regeneration and make artifacts and quest
   completion visible.
6. Allow reset and a handoff to the authenticated `/legacy` journey.

The pure state contract is tested in
`artifacts/pay-it-forward/src/lib/__tests__/legacy-demo-state.test.ts`, while
the built chunk is checked by the deployment verifier.

## Visual references

The supplied Legacy images are preserved under:

- `docs/legacy-mode-design/reference-images/`
- `artifacts/pay-it-forward/public/legacy-living-family-reference.png`
- `artifacts/pay-it-forward/public/niakofa-legacy-live-demo.png`
- `artifacts/pay-it-forward/public/niakofa-legacy-rpg-reference.png`
- `artifacts/pay-it-forward/public/niakofa-legacy-family-tree-reference.png`
