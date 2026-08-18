# Niakofa Legacy Asset Licensing Audit

This reference preserves the August 18, 2026 uploaded audit handoff at
`attached_assets/Pasted-That-confirms-it-s-a-live-JS-rendered-single-page-app-N_1787059898502.txt`.
The source upload is intentionally not committed because chat uploads are
ignored; this file is the durable project record.

## Release decision

The public Legacy runtime may ship only original or provenance-cleared assets.
The uploaded RPG Maker-style generator, RTP-shaped encounter files, raw
combat-reference frames, and undocumented Unity-style textures are reference
material only until their exact license and redistribution terms are recorded.
They must not be imported by shipped source or served from `public/`.

The runtime now uses the original procedural character library under
`public/legacy-world-assets/` and the existing hand-drawn Kwame atlas. The
unverified generator library is not a runtime option.

## Pack-level findings

| Pack | Current verdict | Required action |
| --- | --- | --- |
| RPG Maker RTP-shaped battlebacks and battle commands | Blocked | Keep archived; do not redistribute outside a licensed RPG Maker product. |
| RPG Maker-style TV generator parts | Blocked pending confirmation | Keep archived; do not serve or use as a default character library. |
| Village asset pack | Conditional | Confirm the original marketplace/creator license and preserve attribution before launch. |
| Liberated Pixel Cup reference sheets | Conditional | Add CC-BY-SA attribution and confirm share-alike implications before promotion. |
| DarkNinja combat reference frames | Conditional/risk | Keep raw frames out of the public runtime; use only as a private animation reference. |
| Kwame Mensah and environment atlases | Clear for this project | Preserve source notes and confirm the AI generation tool's commercial terms. |
| Procedural legacy-world-assets | Clear for this project | Keep the original-art catalog and avoid naming collisions with blocked packs. |
| Unlicensed “72 Character Free” pack | Rejected | Confirm it is not present in the shipped asset tree. |
| Undocumented handpainted furniture textures | Blocked | Identify the source/license or replace them before use. |
| RPG Maker-style animation sheets | Blocked | Treat classic RTP filenames as blocked until provenance is proven. |

## Checklist for every future pack

1. Record the pack name/version, source URL, publisher, acquisition date, and
   provenance.
2. Record the exact license text and whether commercial use is explicit.
3. Confirm whether modified files may be bundled in a game and whether raw
   source files may be redistributed in a public repository.
4. Record attribution text, placement, and any share-alike obligations.
5. Record whether the source was an original creator or a re-hosted archive.
6. Assign one verdict: clear, conditional, or blocked.
7. For blocked material, record a replacement source, owner, and target date.

## Automated guard

`pnpm run audit:legacy-assets` scans the shipped Legacy source and public asset
tree for blocked paths. `pnpm run release-validate` runs the same check before
release validation completes. `.gitignore` entries prevent new copies from
being added under the blocked public directories, while the guard prevents
accidental promotion through source or catalog changes.