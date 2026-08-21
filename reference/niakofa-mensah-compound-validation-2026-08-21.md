# Niakofa Legacy — Mensah Compound Validation

This reference records the end-to-end validation pass for the standalone
`niakofa-cmyk/niakofa-legacy-rpg` repository. The RPG remains the source of
truth for PixiJS gameplay; the platform repository must not reintroduce a
duplicate runtime.

## Supplied source documents

- `attached_assets/Pasted-The-newest-RPG-work-is-also-moving-in-the-right-directi_1787340031587.txt`
- `attached_assets/Pasted-Proceed-with-Complete-full-end-to-end-Mensah-Compound-g_1787340047001.txt`

## Verified acceptance coverage

- Standalone dependency install, TypeScript typecheck, and production build
- Mensah ground, buildings, props, Kwame runtime atlas, authored spawn, and
  collision geometry
- Keyboard movement, collision constraints, camera follow, animation
- NPC dialogue, memory interactions, and the authored fishing pond
- Local save/refresh resume wiring
- One-time launch-ticket exchange; raw `token` and `familyId` query parameters
  are rejected
- Browser landing preview renders the playable compound at 1280×720
- Favicon request returns HTTP 200

## Visual verification

The browser capture from this pass is
`screenshots/legacy-mensah-validation-2026-08-21.jpg`.

## Repository boundary

Platform: `https://github.com/niakofa-cmyk/Niakofa`  
Game: `https://github.com/niakofa-cmyk/niakofa-legacy-rpg`

Future gameplay work should continue in the dedicated game repository:
first quest, then a real map transition, then one complete combat loop.