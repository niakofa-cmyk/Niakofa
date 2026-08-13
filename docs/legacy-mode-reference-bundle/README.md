# Niakofa Legacy reference bundle

This directory preserves the uploaded Legacy RPG research and asset sources used
for the production demo pass. The bundle is reference material, not a second
game runtime. The browser receives only the small, explicit presentation subset
listed in `artifacts/pay-it-forward/public/legacy-rpg-assets/catalog.json` and
the inventory textures under `artifacts/pay-it-forward/public/legacy-rpg-assets/inventory/`.

## Source material

| File | Use in Niakofa Legacy |
| --- | --- |
| `source-material/Pasted-The-biggest-discovery-Universal-LPC-This-is-the-largest_1786594572398.txt` | Design and architecture research: deterministic character identity, world regeneration, meaningful evidence inventory, relationship-first gameplay, and asset licensing boundaries. |
| `source-material/Pasted-I-ll-first-audit-the-current-Niakofa-workspace-and-repo_1786594645806.txt` | Audit/session context captured with the upload. |
| `source-material/FREE_Adventurer_2D_Pixel_Art_1786594617868.zip` | Licensed reference for idle/run/attack sprite-sheet conventions. Not presented as a family likeness. |
| `source-material/Free_Inventory_1786594617868.zip` | Licensed inventory UI source. Four textures are curated into the Legacy Satchel. |
| `source-material/Split_animations_1786594625831.zip` | Interaction/traversal animation reference. The full archive remains catalog-only until provenance and production use are reviewed. |

## Licensing notes

- The Adventurer archive permits personal or commercial game use, modification,
  and does not require attribution; it prohibits reselling the asset pack
  standalone and NFT use.
- The Free Inventory archive permits personal or commercial project use and
  modification; it credits ElvGames and prohibits selling the asset pack,
  including modified standalone versions.
- The Split Animations archive includes a read-me but no explicit license grant
  in the uploaded files. It remains reference-only until that grant is
  confirmed.

Keep each archive's embedded `License.txt`/`Read_me.TXT` beside the source
archive. Before a public commercial launch, re-check the current licenses and
record any required attribution in the asset catalog.

## Runtime boundary

Legacy remains one React/Vite experience. The Family Vault and demo state are
authoritative. The Satchel is a read-only projection of the existing
`placedArtifacts` and `discoveredLandmarks` state, so it cannot silently create
inventory progress or duplicate world mutations. Generic RPG art is never
described as a verified family record or real family likeness.